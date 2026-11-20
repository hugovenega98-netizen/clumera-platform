import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agendaDay, clubDayOf, clubTime, confirmSlotTx, occupancy, placeSlot, releaseExpiredHolds } from '../src';

describe('hora del club', () => {
  it('Argentina: 18:00 del club son las 21:00 UTC', () => {
    expect(clubTime('2026-11-21', 18 * 60).toISOString()).toBe('2026-11-21T21:00:00.000Z');
    expect(clubDayOf(new Date('2026-11-22T02:30:00Z'))).toEqual({ day: '2026-11-21', minutes: 23 * 60 + 30, weekday: 5 });
  });
});

const url = testDatabaseUrl('agenda');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('agenda central', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  let venueId = '';
  const at = (h: number) => clubTime('2026-11-21', h * 60);
  const slot = (h: number, kind: 'booking' | 'tournament' | 'block' = 'booking', holdMinutes?: number) => ({
    venueId,
    startsAt: at(h),
    endsAt: at(h + 1),
    kind,
    label: kind,
    source: 'test',
    sourceRef: `${kind}-${h}-${Math.random()}`,
    holdMinutes,
  });
  const now = new Date('2026-11-20T12:00:00Z');

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Venue","AgendaSlot","OutboxEvent" CASCADE');
    venueId = (await prisma.venue.create({ data: { slug: 'padel-2', name: 'Pádel 2', group: 'Pádel' } })).id;
  });

  it('dos solicitudes simultáneas por el mismo turno: confirma una sola', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => placeSlot(prisma, slot(18, 'booking', 10), now)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && r.error.code === 'conflict')).toBe(true);
    expect(await prisma.agendaSlot.count({ where: { status: { not: 'released' } } })).toBe(1);
  });

  it('turnos contiguos no chocan; superpuestos sí', async () => {
    expect((await placeSlot(prisma, slot(18), now)).ok).toBe(true);
    expect((await placeSlot(prisma, slot(19), now)).ok).toBe(true);
    expect(await placeSlot(prisma, { ...slot(18), startsAt: new Date(at(18).getTime() + 30 * 60_000), endsAt: new Date(at(19).getTime() + 30 * 60_000) }, now)).toMatchObject({ ok: false });
  });

  it('prioridad: un torneo desplaza una retención sin pagar, nunca una reserva confirmada', async () => {
    const held = await placeSlot(prisma, slot(15, 'booking', 10), now);
    const t = await placeSlot(prisma, slot(15, 'tournament'), now);
    expect(t).toMatchObject({ ok: true, value: { displaced: [held.ok ? held.value.id : ''] } });
    expect(await prisma.outboxEvent.count({ where: { type: 'agenda.slot_released' } })).toBe(1);
    await placeSlot(prisma, slot(17), now);
    expect(await placeSlot(prisma, slot(17, 'tournament'), now)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    // Y una reserva no pisa un torneo.
    expect(await placeSlot(prisma, slot(15, 'booking', 10), now)).toMatchObject({ ok: false });
  });

  it('la retención vence sola: cuenta como libre y se puede volver a confirmar si nadie la tomó', async () => {
    const held = await placeSlot(prisma, slot(18, 'booking', 10), now);
    const later = new Date(now.getTime() + 11 * 60_000);
    expect(await occupancy(prisma, [venueId], at(0), at(23), later)).toHaveLength(0);
    // Pago tardío: nadie tomó el turno, se confirma igual.
    const id = held.ok ? held.value.id : '';
    expect(await prisma.$transaction((tx) => confirmSlotTx(tx, id, later))).toMatchObject({ ok: true });
    // Otra retención vencida, y alguien más toma el turno antes del pago: conflicto.
    const h2 = await placeSlot(prisma, slot(20, 'booking', 10), now);
    expect((await placeSlot(prisma, slot(20, 'booking', 10), later)).ok).toBe(true);
    expect(await prisma.$transaction((tx) => confirmSlotTx(tx, h2.ok ? h2.value.id : '', later))).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('el cron libera las retenciones vencidas y la agenda del día las omite', async () => {
    await placeSlot(prisma, slot(9, 'booking', 10), now);
    await placeSlot(prisma, slot(10, 'block'), now);
    expect(await releaseExpiredHolds(prisma, new Date(now.getTime() + 20 * 60_000))).toBe(1);
    const day = await agendaDay(prisma, '2026-11-21', undefined, new Date(now.getTime() + 20 * 60_000));
    expect(day[0]!.slots.map((s) => [s.kind, s.fromMinute, s.toMinute])).toEqual([['block', 600, 660]]);
  });

  it('un espacio en mantenimiento no acepta reservas, sí bloqueos', async () => {
    await prisma.venue.update({ where: { id: venueId }, data: { status: 'maintenance' } });
    expect(await placeSlot(prisma, slot(12), now)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect((await placeSlot(prisma, slot(12, 'block'), now)).ok).toBe(true);
  });
});
