import { clubTime } from '@clumera/agenda';
import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { recordPayment, startOnlinePayment } from '@clumera/finance';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { availability, cancelBooking, confirmPaidBookings, createBooking, myBookings, payOptions, sweepExpiredBookings, tariffFor } from '../src';

describe('precios y formas de pago', () => {
  const tariffs = [
    { label: 'Mañana', days: 0b0011111, fromMinute: 480, toMinute: 1080, memberPrice: 600000, guestPrice: 900000 },
    { label: 'Noche y fin de semana', days: 0b1111111, fromMinute: 1080, toMinute: 1380, memberPrice: 900000, guestPrice: 1200000 },
  ];
  it('elige la franja por día y hora del club', () => {
    expect(tariffFor(tariffs, clubTime('2026-11-20', 10 * 60))!.label).toBe('Mañana'); // viernes
    expect(tariffFor(tariffs, clubTime('2026-11-21', 10 * 60))).toBeNull(); // sábado a la mañana: sin tarifa
    expect(tariffFor(tariffs, clubTime('2026-11-21', 18 * 60))!.label).toBe('Noche y fin de semana');
  });
  it('seña: porcentaje redondeado; pagar en el club solo si la regla lo permite', () => {
    expect(payOptions(900000, { depositPercent: 50, payAtClub: false }).map((o) => [o.mode, o.amount, o.available])).toEqual([
      ['full', 900000, true],
      ['deposit', 450000, true],
      ['club', 0, false],
    ]);
    expect(payOptions(900000, { depositPercent: 0, payAtClub: true })[1]!.available).toBe(false);
  });
});

const url = testDatabaseUrl('bookings');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('reservas de socios', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};
  const now = new Date('2026-11-19T15:00:00Z'); // jueves 12:00 del club
  const sat18 = clubTime('2026-11-21', 18 * 60);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Venue","AgendaSlot","BookingRule","Tariff","Booking","Person","ClubMembership","MembershipCategory","Charge","Payment","PaymentAllocation","OutboxEvent","AuditLog" CASCADE',
    );
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo' } });
    for (const k of ['ana', 'beto', 'externo']) ids[k] = (await prisma.person.create({ data: { firstName: k, lastName: 'X' } })).id;
    for (const k of ['ana', 'beto']) await prisma.clubMembership.create({ data: { personId: ids[k]!, categoryId: cat.id, validFrom: new Date('2025-01-01') } });
    const v = await prisma.venue.create({ data: { slug: 'padel-2', name: 'Pádel 2', group: 'Pádel' } });
    ids.venue = v.id;
    await prisma.bookingRule.create({ data: { venueId: v.id, slotMinutes: 60, openFrom: 480, openTo: 1380, holdMinutes: 10, cancelHours: 24, depositPercent: 50, payAtClub: true } });
    await prisma.tariff.create({ data: { venueId: v.id, label: 'Todo el día', days: 127, fromMinute: 480, toMinute: 1380, memberPrice: 900000, guestPrice: 1200000 } });
  });

  it('turnero: libres, ocupados sin datos de terceros, pasados y precio de socio', async () => {
    await createBooking(prisma, ids.beto!, { personId: ids.beto!, venueId: ids.venue!, startsAt: sat18, payMode: 'club' }, now);
    const day = (await availability(prisma, ids.venue!, '2026-11-21', true, now))!;
    expect(day).toHaveLength(15);
    expect(day.find((s) => s.start === '18:00')).toMatchObject({ state: 'busy', label: 'Reservado', price: 900000 });
    expect(day.find((s) => s.start === '19:00')).toMatchObject({ state: 'free' });
    expect(JSON.stringify(day)).not.toContain('beto');
    const today = (await availability(prisma, ids.venue!, '2026-11-19', false, now))!;
    expect(today.find((s) => s.start === '09:00')!.state).toBe('past');
    expect(today.find((s) => s.start === '20:00')!.price).toBe(1200000);
  });

  it('online: retiene el turno, emite el cargo y el pago lo confirma', async () => {
    const r = await createBooking(prisma, ids.ana!, { personId: ids.ana!, venueId: ids.venue!, startsAt: sat18, payMode: 'deposit' }, now);
    expect(r).toMatchObject({ ok: true, value: { status: 'held', amount: 450000 } });
    const b = r.ok ? r.value : null!;
    expect(await prisma.charge.findUnique({ where: { id: b.chargeId! }, select: { description: true, concept: true, source: true } })).toEqual({ description: 'Seña reserva Pádel 2 · sáb 21/11 18:00', concept: 'reserva', source: 'bookings' });
    // Otra persona no puede tomar el mismo turno mientras está retenido.
    expect(await createBooking(prisma, ids.beto!, { personId: ids.beto!, venueId: ids.venue!, startsAt: sat18, payMode: 'full' }, now)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    await recordPayment(prisma, ids.ana!, { payerPersonId: ids.ana!, chargeIds: [b.chargeId!], method: 'transfer' });
    const out = await prisma.$transaction((tx) => confirmPaidBookings(tx, [b.chargeId!], now));
    expect(out).toEqual([{ id: b.id, personId: ids.ana, outcome: 'confirmed', title: 'Pádel 2 · sáb 21/11 18:00' }]);
    expect(await prisma.agendaSlot.findFirst({ where: { sourceRef: b.id }, select: { status: true } })).toEqual({ status: 'confirmed' });
  });

  it('seis personas por el mismo turno al mismo tiempo: una sola lo retiene', async () => {
    const people = await Promise.all(Array.from({ length: 6 }, (_, i) => prisma.person.create({ data: { firstName: `p${i}`, lastName: 'X' } })));
    const results = await Promise.all(people.map((p) => createBooking(prisma, p.id, { personId: p.id, venueId: ids.venue!, startsAt: sat18, payMode: 'full' }, now)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await prisma.charge.count()).toBe(1);
  });

  it('vence sin pago: libera el turno y anula el cargo; con un pago en curso, estira la retención', async () => {
    const a = await createBooking(prisma, ids.ana!, { personId: ids.ana!, venueId: ids.venue!, startsAt: sat18, payMode: 'full' }, now);
    const b = await createBooking(prisma, ids.beto!, { personId: ids.beto!, venueId: ids.venue!, startsAt: clubTime('2026-11-21', 19 * 60), payMode: 'full' }, now);
    await startOnlinePayment(prisma, { payerPersonId: ids.beto!, chargeIds: [b.ok ? b.value.chargeId! : ''], provider: 'mercadopago' });
    const later = new Date(now.getTime() + 11 * 60_000);
    expect(await sweepExpiredBookings(prisma, later)).toEqual({ expired: 1, extended: 1 });
    expect(await prisma.booking.findUnique({ where: { id: a.ok ? a.value.id : '' }, select: { status: true } })).toEqual({ status: 'expired' });
    expect(await prisma.charge.findUnique({ where: { id: a.ok ? a.value.chargeId! : '' }, select: { status: true } })).toEqual({ status: 'cancelled' });
    expect((await availability(prisma, ids.venue!, '2026-11-21', true, later))!.find((s) => s.start === '18:00')!.state).toBe('free');
    expect((await availability(prisma, ids.venue!, '2026-11-21', true, later))!.find((s) => s.start === '19:00')!.state).toBe('busy');
  });

  it('pago tardío: confirma si nadie tomó el turno; si alguien lo tomó, queda en conflicto con reintegro', async () => {
    const a = await createBooking(prisma, ids.ana!, { personId: ids.ana!, venueId: ids.venue!, startsAt: sat18, payMode: 'full' }, now);
    const later = new Date(now.getTime() + 20 * 60_000);
    await createBooking(prisma, ids.beto!, { personId: ids.beto!, venueId: ids.venue!, startsAt: sat18, payMode: 'club' }, later);
    const chargeId = a.ok ? a.value.chargeId! : '';
    await recordPayment(prisma, ids.ana!, { payerPersonId: ids.ana!, chargeIds: [chargeId], method: 'transfer' });
    const out = await prisma.$transaction((tx) => confirmPaidBookings(tx, [chargeId], later));
    expect(out[0]!.outcome).toBe('conflict');
    expect(await prisma.booking.findUnique({ where: { id: a.ok ? a.value.id : '' }, select: { status: true, refundDue: true } })).toEqual({ status: 'conflict', refundDue: 900000 });
    expect(await prisma.agendaSlot.count({ where: { status: 'confirmed' } })).toBe(1);
  });

  it('cancelar: a tiempo libera y deja el reintegro de lo pagado; fuera de plazo, solo el club', async () => {
    const r = await createBooking(prisma, ids.ana!, { personId: ids.ana!, venueId: ids.venue!, startsAt: sat18, payMode: 'deposit' }, now);
    const b = r.ok ? r.value : null!;
    await recordPayment(prisma, ids.ana!, { payerPersonId: ids.ana!, chargeIds: [b.chargeId!], method: 'transfer' });
    await prisma.$transaction((tx) => confirmPaidBookings(tx, [b.chargeId!], now));
    const close = new Date(sat18.getTime() - 3 * 3_600_000);
    expect(await cancelBooking(prisma, ids.ana!, b.id, { byManager: false }, close)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect((await myBookings(prisma, [ids.ana!], close))[0]!.cancellable).toBe(false);
    expect(await cancelBooking(prisma, ids.ana!, b.id, { byManager: false }, now)).toEqual({ ok: true, value: { status: 'cancelled', refundDue: 450000 } });
    expect((await availability(prisma, ids.venue!, '2026-11-21', true, now))!.find((s) => s.start === '18:00')!.state).toBe('free');
    // Pagar en el club y cancelar: el cargo pendiente se anula.
    const c = await createBooking(prisma, ids.beto!, { personId: ids.beto!, venueId: ids.venue!, startsAt: sat18, payMode: 'club' }, now);
    await cancelBooking(prisma, ids.beto!, c.ok ? c.value.id : '', { byManager: false }, now);
    expect(await prisma.charge.findUnique({ where: { id: c.ok ? c.value.chargeId! : '' }, select: { status: true } })).toEqual({ status: 'cancelled' });
  });

  it('reglas: fuera de la grilla, pasado, demasiado adelante y una sola retención impaga por persona', async () => {
    const bad = (startsAt: Date) => createBooking(prisma, ids.ana!, { personId: ids.ana!, venueId: ids.venue!, startsAt, payMode: 'full' }, now);
    expect(await bad(clubTime('2026-11-21', 18 * 60 + 30))).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await bad(clubTime('2026-11-19', 9 * 60))).toMatchObject({ ok: false });
    expect(await bad(clubTime('2026-12-20', 18 * 60))).toMatchObject({ ok: false });
    expect((await bad(sat18)).ok).toBe(true);
    expect(await bad(clubTime('2026-11-21', 20 * 60))).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });
});
