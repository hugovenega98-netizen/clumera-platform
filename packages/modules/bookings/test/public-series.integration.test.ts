import { clubTime } from '@clumera/agenda';
import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cancelBookingSeries,
  createBookingSeries,
  createPublicBooking,
  guestBookingToken,
  guestPersonFor,
  listBookingSeries,
  publicVenues,
  readGuestBookingToken,
  seriesDays,
} from '../src';

const KEY = 'clave-de-prueba-suficientemente-larga';

describe('enlace firmado de la reserva', () => {
  it('lee el id solo con la firma correcta', () => {
    const t = guestBookingToken('ckabc123', KEY);
    expect(readGuestBookingToken(t, KEY)).toBe('ckabc123');
    expect(readGuestBookingToken(t, `${KEY}x`)).toBeNull();
    expect(readGuestBookingToken(t.replace('ckabc123', 'ckabc124'), KEY)).toBeNull();
    expect(readGuestBookingToken(`${t}.x`, KEY)).toBeNull();
    expect(readGuestBookingToken('ckabc123', KEY)).toBeNull();
    expect(() => guestBookingToken('x', 'corta')).toThrow();
  });
});

describe('días de una reserva fija', () => {
  it('arranca en el primer día pedido de la semana y sigue cada 7 días', () => {
    // 2026-11-20 es viernes; martes = 1.
    expect(seriesDays(1, '2026-11-20', '2026-12-15')).toEqual(['2026-11-24', '2026-12-01', '2026-12-08', '2026-12-15']);
    expect(seriesDays(4, '2026-11-20', '2026-11-20')).toEqual(['2026-11-20']);
    expect(seriesDays(0, '2026-11-20', '2026-11-22')).toEqual([]);
  });
});

const url = testDatabaseUrl('bookings');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('reserva pública y reservas fijas', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};
  const now = new Date('2026-11-19T15:00:00Z'); // jueves 12:00 del club
  const sat18 = clubTime('2026-11-21', 18 * 60);
  const guest = { name: 'Martina  Ruiz', email: 'Martina@Example.com', phone: '+54 9 11 5555-1234' };

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Venue","AgendaSlot","BookingRule","Tariff","Booking","BookingSeries","Person","UserAccount","ClubMembership","MembershipCategory","Charge","Payment","PaymentAllocation","OutboxEvent","AuditLog" CASCADE',
    );
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo' } });
    const ana = await prisma.person.create({ data: { firstName: 'Ana', lastName: 'Socia', email: 'ana@example.com' } });
    ids.ana = ana.id;
    await prisma.clubMembership.create({ data: { personId: ana.id, categoryId: cat.id, validFrom: new Date('2025-01-01') } });
    const staff = await prisma.person.create({ data: { firstName: 'Ema', lastName: 'Staff', email: 'ema@example.com' } });
    ids.staff = staff.id;
    await prisma.userAccount.create({ data: { personId: staff.id, login: 'ema@example.com' } });
    // Cuenta cuyo email está solo en el login (la ficha no tiene email).
    const solo = await prisma.person.create({ data: { firstName: 'Leo', lastName: 'Login' } });
    await prisma.userAccount.create({ data: { personId: solo.id, login: 'leo@example.com' } });
    for (const [slug, pub] of [['padel-1', true], ['padel-2', false]] as const) {
      const v = await prisma.venue.create({ data: { slug, name: slug === 'padel-1' ? 'Pádel 1' : 'Pádel 2', group: 'Pádel' } });
      ids[slug] = v.id;
      await prisma.bookingRule.create({ data: { venueId: v.id, slotMinutes: 60, openFrom: 480, openTo: 1380, holdMinutes: 10, cancelHours: 24, depositPercent: 30, payAtClub: false, publicBooking: pub, maxAdvanceDays: 7 } });
      await prisma.tariff.create({ data: { venueId: v.id, label: 'Todo el día', days: 127, fromMinute: 480, toMinute: 1380, memberPrice: 900000, guestPrice: 1200000 } });
    }
  });

  it('solo lista los espacios habilitados para el público', async () => {
    expect((await publicVenues(prisma)).map((v) => v.slug)).toEqual(['padel-1']);
  });

  it('invitado: tarifa general, seña online y la reserva queda marcada como pública', async () => {
    const r = await createPublicBooking(prisma, { venueId: ids['padel-1']!, startsAt: sat18, payMode: 'deposit', guest }, now);
    expect(r).toMatchObject({ ok: true, value: { status: 'held', amount: 360000 } });
    const b = await prisma.booking.findUniqueOrThrow({ where: { id: r.ok ? r.value.id : '' }, include: { person: true } });
    expect(b).toMatchObject({ public: true, memberRate: false, price: 1200000 });
    expect(b.person).toMatchObject({ firstName: 'Martina', lastName: 'Ruiz', email: 'martina@example.com', phone: '+5491155551234' });
    // El mismo email reutiliza a la persona invitada.
    const again = await guestPersonFor(prisma, { ...guest, email: 'martina@example.com' });
    expect(again).toMatchObject({ ok: true, value: { personId: b.personId, created: false } });
  });

  it('nunca asocia una reserva pública a un socio ni a alguien con cuenta', async () => {
    for (const email of ['ana@example.com', 'EMA@example.com', 'leo@example.com']) {
      const r = await createPublicBooking(prisma, { venueId: ids['padel-1']!, startsAt: sat18, payMode: 'full', guest: { ...guest, email } }, now);
      expect(r).toMatchObject({ ok: false, error: { code: 'conflict', details: { reason: 'member_email' } } });
    }
    expect(await prisma.booking.count()).toBe(0);
    expect(await prisma.charge.count()).toBe(0);
  });

  it('rechaza espacios no públicos, datos incompletos y pagar en el club', async () => {
    expect(await createPublicBooking(prisma, { venueId: ids['padel-2']!, startsAt: sat18, payMode: 'full', guest }, now)).toMatchObject({ ok: false, error: { code: 'not_found' } });
    for (const g of [{ ...guest, email: 'no-es-email' }, { ...guest, name: 'Martina' }, { ...guest, phone: '123' }])
      expect(await createPublicBooking(prisma, { venueId: ids['padel-1']!, startsAt: sat18, payMode: 'full', guest: g }, now)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await createPublicBooking(prisma, { venueId: ids['padel-1']!, startsAt: sat18, payMode: 'club' as never, guest }, now)).toMatchObject({ ok: false });
    expect(await prisma.person.count()).toBe(3);
  });

  it('reserva fija: una reserva por semana, sin tope de anticipación; salta los choques y se cancela entera', async () => {
    // Una semana ya está ocupada por otra reserva fija.
    const other = await createBookingSeries(prisma, ids.staff!, { venueId: ids['padel-2']!, personId: ids.staff!, weekday: 1, startMinute: 20 * 60, fromDay: '2026-12-01', untilDay: '2026-12-01' }, now);
    expect(other).toMatchObject({ ok: true, value: { booked: ['2026-12-01'] } });

    const r = await createBookingSeries(prisma, ids.staff!, { venueId: ids['padel-2']!, personId: ids.ana!, weekday: 1, startMinute: 20 * 60, fromDay: '2026-11-20', untilDay: '2027-01-12', label: 'Ana · martes' }, now);
    expect(r.ok).toBe(true);
    const out = r.ok ? r.value : null!;
    expect(out.booked).toEqual(['2026-11-24', '2026-12-08', '2026-12-15', '2026-12-22', '2026-12-29', '2027-01-05', '2027-01-12']);
    expect(out.skipped).toEqual([{ day: '2026-12-01', reason: 'Ese turno ya no está libre: elegí otro' }]);
    const rows = await prisma.booking.findMany({ where: { seriesId: out.id }, select: { status: true, payMode: true, price: true, chargeId: true } });
    expect(rows).toHaveLength(7);
    expect(rows.every((b) => b.status === 'confirmed' && b.payMode === 'club' && b.price === 900000 && b.chargeId)).toBe(true);
    expect(await prisma.agendaSlot.count({ where: { label: 'Reserva fija', status: 'confirmed' } })).toBe(8);

    const list = await listBookingSeries(prisma, [ids['padel-2']!], now);
    expect(list.find((s) => s.id === out.id)).toMatchObject({ label: 'Ana · martes', when: 'Martes 20:00', upcoming: 7, next: 'Pádel 2 · mar 24/11 20:00' });

    expect(await cancelBookingSeries(prisma, ids.staff!, out.id, now)).toEqual({ ok: true, value: { cancelled: 7, personId: ids.ana } });
    expect(await prisma.booking.count({ where: { seriesId: out.id, status: 'cancelled' } })).toBe(7);
    expect(await prisma.charge.count({ where: { status: 'cancelled', source: 'bookings' } })).toBe(7);
    expect(await cancelBookingSeries(prisma, ids.staff!, out.id, now)).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('reserva fija: valida horario y rango', async () => {
    const base = { venueId: ids['padel-2']!, personId: ids.ana!, weekday: 1, startMinute: 20 * 60, fromDay: '2026-11-20', untilDay: '2026-12-31' };
    expect(await createBookingSeries(prisma, ids.staff!, { ...base, startMinute: 20 * 60 + 30 }, now)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await createBookingSeries(prisma, ids.staff!, { ...base, untilDay: '2027-12-31' }, now)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await createBookingSeries(prisma, ids.staff!, { ...base, fromDay: '2026-10-01', untilDay: '2026-11-10' }, now)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await prisma.bookingSeries.count()).toBe(0);
  });
});
