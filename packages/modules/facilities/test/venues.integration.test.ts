import { clubTime, placeSlot } from '@clumera/agenda';
import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addTariff, createBlock, createVenue, removeBlock, setBookingRule, setVenueStatus, venuesAdmin } from '../src';

const url = testDatabaseUrl('facilities');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('instalaciones', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  let admin = '';
  let venue = '';
  const now = new Date('2026-11-19T15:00:00Z');

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Venue","AgendaSlot","BookingRule","Tariff","Person","AuditLog","OutboxEvent" CASCADE');
    admin = (await prisma.person.create({ data: { firstName: 'Diego', lastName: 'M' } })).id;
    const v = await createVenue(prisma, admin, { name: 'Pádel 2', slug: 'padel-2', group: 'Pádel' });
    venue = v.ok ? v.value.id : '';
  });

  it('alta con identificador válido y único', async () => {
    expect(await createVenue(prisma, admin, { name: 'X', slug: 'Con Espacios', group: 'G' })).toMatchObject({ ok: false });
    expect(await createVenue(prisma, admin, { name: 'Otro', slug: 'padel-2', group: 'Pádel' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('reglas: el horario se divide en turnos enteros; tarifas sin superponerse en los mismos días', async () => {
    const rule = { slotMinutes: 120, openFrom: 480, openTo: 1380, maxAdvanceDays: 14, holdMinutes: 10, cancelHours: 24, depositPercent: 50, payAtClub: false };
    expect(await setBookingRule(prisma, admin, venue, rule)).toMatchObject({ ok: false });
    expect((await setBookingRule(prisma, admin, venue, { ...rule, slotMinutes: 60 })).ok).toBe(true);
    const t = { label: 'Semana', days: 0b0011111, fromMinute: 480, toMinute: 1080, memberPrice: 600000, guestPrice: 900000 };
    expect((await addTariff(prisma, admin, venue, t)).ok).toBe(true);
    expect(await addTariff(prisma, admin, venue, { ...t, label: 'Choca', fromMinute: 1000, toMinute: 1200 })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect((await addTariff(prisma, admin, venue, { ...t, label: 'Finde', days: 0b1100000 })).ok).toBe(true);
    const [v] = await venuesAdmin(prisma);
    expect(v!.tariffs.map((x) => x.label)).toEqual(['Semana', 'Finde']);
  });

  it('bloqueo: desplaza retenciones sin pagar, no pisa confirmadas; se puede quitar', async () => {
    await placeSlot(prisma, { venueId: venue, startsAt: clubTime('2026-11-21', 600), endsAt: clubTime('2026-11-21', 660), kind: 'booking', label: 'r', source: 't', sourceRef: '1', holdMinutes: 10 }, now);
    await placeSlot(prisma, { venueId: venue, startsAt: clubTime('2026-11-21', 720), endsAt: clubTime('2026-11-21', 780), kind: 'booking', label: 'Reserva', source: 't', sourceRef: '2' }, now);
    const ok = await createBlock(prisma, admin, { venueId: venue, day: '2026-11-21', fromMinute: 540, toMinute: 690, reason: 'Resiembra' }, now);
    expect(ok).toMatchObject({ ok: true, value: { displaced: [expect.any(String)] } });
    expect(await createBlock(prisma, admin, { venueId: venue, day: '2026-11-21', fromMinute: 700, toMinute: 800, reason: 'Pintura' }, now)).toMatchObject({ ok: false, error: { code: 'conflict', message: expect.stringContaining('Reserva') } });
    expect((await removeBlock(prisma, admin, ok.ok ? ok.value.id : '')).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: { in: ['venue.blocked', 'venue.unblocked'] } } })).toBe(2);
  });

  it('estado físico con nota; disponible la borra', async () => {
    await setVenueStatus(prisma, admin, venue, 'maintenance', 'Cambio de red');
    expect(await prisma.venue.findUnique({ where: { id: venue }, select: { status: true, statusNote: true } })).toEqual({ status: 'maintenance', statusNote: 'Cambio de red' });
    await setVenueStatus(prisma, admin, venue, 'available', 'x');
    expect((await prisma.venue.findUnique({ where: { id: venue } }))!.statusNote).toBe('');
  });
});
