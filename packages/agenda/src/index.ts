/**
 * Agenda central: una sola fuente de verdad de qué espacio está ocupado y cuándo. La usan Reservas,
 * Instalaciones (bloqueos) y, más adelante, Deportes, Escuelas, Torneos y Eventos.
 *
 * Garantías:
 * - Dos ocupaciones vigentes (retenidas sin vencer o confirmadas) nunca se superponen en un espacio,
 *   aun con solicitudes simultáneas: cada escritura toma un bloqueo transaccional por espacio
 *   (pg_advisory_xact_lock, que se libera al terminar la transacción y funciona detrás del pooler).
 * - Prioridad: bloqueo > partido > torneo > evento > escuela > reserva. Una ocupación de mayor
 *   prioridad desplaza retenciones de menor prioridad (todavía sin pagar), nunca confirmaciones.
 * - Una retención vence sola: pasada su hora cuenta como libre y se libera al tocar el espacio.
 */
import { appendOutbox, type Prisma, type PrismaClient } from '@clumera/db';
import { createEvent, DomainError, type Result } from '@clumera/kernel';

export type Db = PrismaClient | Prisma.TransactionClient;
type Tx = Prisma.TransactionClient;
export type AgendaKind = 'block' | 'match' | 'tournament' | 'event' | 'school' | 'booking';

export const AGENDA_PRIORITY: Record<AgendaKind, number> = { block: 100, match: 80, tournament: 60, event: 50, school: 40, booking: 20 };
export const AGENDA_LABEL: Record<AgendaKind, string> = { block: 'Bloqueado', match: 'Partido', tournament: 'Torneo', event: 'Evento', school: 'Escuela', booking: 'Reservado' };
export const CLUB_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string, details?: Record<string, unknown>) => ({ ok: false, error: new DomainError(code, message, details) }) as const;

// ───────────── Horario del club ─────────────

/** Diferencia en minutos entre la hora del club y UTC en ese instante (Argentina: −180). */
export function zoneOffsetMinutes(at: Date, timeZone = CLUB_TIME_ZONE): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return Math.round((asUtc - at.getTime() + at.getUTCMilliseconds()) / 60_000);
}

/** Instante UTC de «día aaaa-mm-dd a los N minutos» en la hora del club. */
export function clubTime(day: string, minutes: number, timeZone = CLUB_TIME_ZONE): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, 0, minutes));
  return new Date(guess.getTime() - zoneOffsetMinutes(guess, timeZone) * 60_000);
}

/** Día (aaaa-mm-dd) y minutos desde las 00:00 en la hora del club. */
export function clubDayOf(at: Date, timeZone = CLUB_TIME_ZONE): { day: string; minutes: number; weekday: number } {
  const local = new Date(at.getTime() + zoneOffsetMinutes(at, timeZone) * 60_000);
  return {
    day: local.toISOString().slice(0, 10),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    /** 0 = lunes … 6 = domingo. */
    weekday: (local.getUTCDay() + 6) % 7,
  };
}

// ───────────── Ocupación ─────────────

/** Ocupaciones vigentes: confirmadas o retenidas sin vencer. */
export const activeWhere = (now: Date): Prisma.AgendaSlotWhereInput => ({ OR: [{ status: 'confirmed' }, { status: 'held', holdExpiresAt: { gt: now } }] });

export async function occupancy(db: Db, venueIds: string[], from: Date, to: Date, now = new Date()) {
  if (!venueIds.length) return [];
  return db.agendaSlot.findMany({
    where: { venueId: { in: venueIds }, startsAt: { lt: to }, endsAt: { gt: from }, ...activeWhere(now) },
    orderBy: { startsAt: 'asc' },
    select: { id: true, venueId: true, startsAt: true, endsAt: true, kind: true, priority: true, status: true, label: true, source: true, sourceRef: true, holdExpiresAt: true },
  });
}

async function lockVenue(tx: Tx, venueId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agenda:${venueId}`}, 0))`;
}

async function released(tx: Tx, slot: { id: string; source: string; sourceRef: string }, reason: 'expired' | 'displaced' | 'released', now: Date) {
  await tx.agendaSlot.update({ where: { id: slot.id }, data: { status: 'released', releasedAt: now } });
  await appendOutbox(tx, createEvent('agenda.slot_released', 'agenda', { slotId: slot.id, source: slot.source, sourceRef: slot.sourceRef, reason }));
}

export interface SlotInput {
  venueId: string;
  startsAt: Date;
  endsAt: Date;
  kind: AgendaKind;
  label: string;
  source: string;
  sourceRef: string;
  createdById?: string | null;
  /** Con minutos: retención que vence; sin ellos: confirmada. */
  holdMinutes?: number;
}

/**
 * Ocupa un espacio dentro de la transacción del llamador. Libera retenciones vencidas, desplaza
 * retenciones de menor prioridad y rechaza si queda algo igual o más importante encima.
 */
export async function placeSlotTx(tx: Tx, input: SlotInput, now = new Date()): Promise<Result<{ id: string; displaced: string[] }>> {
  if (!(input.endsAt > input.startsAt)) return fail('invalid_input', 'El horario no es válido');
  const venue = await tx.venue.findUnique({ where: { id: input.venueId }, select: { active: true, status: true } });
  if (!venue?.active) return fail('not_found', 'Espacio inexistente');
  if (venue.status !== 'available' && input.kind !== 'block') return fail('conflict', 'El espacio no está disponible (mantenimiento o fuera de servicio)');
  await lockVenue(tx, input.venueId);
  const overlapping = await tx.agendaSlot.findMany({
    where: { venueId: input.venueId, startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt }, status: { in: ['held', 'confirmed'] } },
    select: { id: true, kind: true, priority: true, status: true, holdExpiresAt: true, source: true, sourceRef: true, label: true },
  });
  const priority = AGENDA_PRIORITY[input.kind];
  const displaced: string[] = [];
  const blocking = [];
  for (const o of overlapping) {
    if (o.status === 'held' && o.holdExpiresAt && o.holdExpiresAt <= now) await released(tx, o, 'expired', now);
    else if (o.status === 'held' && o.priority < priority) {
      await released(tx, o, 'displaced', now);
      displaced.push(o.id);
    } else blocking.push(o);
  }
  if (blocking.length) return fail('conflict', 'Ese horario ya está ocupado', { by: blocking.map((b) => ({ kind: b.kind, label: b.label })) });
  const slot = await tx.agendaSlot.create({
    data: {
      venueId: input.venueId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      kind: input.kind,
      priority,
      status: input.holdMinutes ? 'held' : 'confirmed',
      holdExpiresAt: input.holdMinutes ? new Date(now.getTime() + input.holdMinutes * 60_000) : null,
      label: input.label.slice(0, 120),
      source: input.source,
      sourceRef: input.sourceRef,
      createdById: input.createdById ?? null,
    },
  });
  return { ok: true, value: { id: slot.id, displaced } };
}

/** Igual que `placeSlotTx`, en su propia transacción. */
export async function placeSlot(db: PrismaClient, input: SlotInput, now = new Date()): Promise<Result<{ id: string; displaced: string[] }>> {
  try {
    return await db.$transaction(async (tx) => {
      const r = await placeSlotTx(tx, input, now);
      if (!r.ok) throw r.error;
      return r;
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
}

/**
 * Confirma una retención (por ejemplo, al acreditarse el pago). Si venció o se liberó, la vuelve a
 * tomar solo si el horario sigue libre.
 */
export async function confirmSlotTx(tx: Tx, slotId: string, now = new Date()): Promise<Result<{ id: string }>> {
  const slot = await tx.agendaSlot.findUnique({ where: { id: slotId } });
  if (!slot) return fail('not_found', 'Ocupación inexistente');
  if (slot.status === 'confirmed') return { ok: true, value: { id: slot.id } };
  await lockVenue(tx, slot.venueId);
  const others = await tx.agendaSlot.findMany({
    where: { id: { not: slot.id }, venueId: slot.venueId, startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt }, ...activeWhere(now) },
    select: { id: true },
  });
  if (others.length) return fail('conflict', 'El turno ya fue tomado por otra ocupación');
  await tx.agendaSlot.update({ where: { id: slot.id }, data: { status: 'confirmed', holdExpiresAt: null, releasedAt: null } });
  return { ok: true, value: { id: slot.id } };
}

/** Extiende una retención vigente (pago online en curso). */
export async function extendHoldTx(tx: Tx, slotId: string, until: Date): Promise<boolean> {
  const r = await tx.agendaSlot.updateMany({ where: { id: slotId, status: 'held' }, data: { holdExpiresAt: until } });
  return r.count > 0;
}

export async function releaseSlotTx(tx: Tx, slotId: string, now = new Date()): Promise<void> {
  const slot = await tx.agendaSlot.findUnique({ where: { id: slotId }, select: { id: true, status: true, source: true, sourceRef: true } });
  if (slot && slot.status !== 'released') await released(tx, slot, 'released', now);
}

/** Libera las retenciones vencidas de todos los espacios (lo corre el cron). */
export async function releaseExpiredHolds(db: PrismaClient, now = new Date()): Promise<number> {
  const stale = await db.agendaSlot.findMany({ where: { status: 'held', holdExpiresAt: { lte: now } }, select: { id: true, venueId: true }, take: 500 });
  let n = 0;
  for (const s of stale)
    await db.$transaction(async (tx) => {
      await lockVenue(tx, s.venueId);
      const fresh = await tx.agendaSlot.findUnique({ where: { id: s.id }, select: { id: true, status: true, holdExpiresAt: true, source: true, sourceRef: true } });
      if (fresh?.status === 'held' && fresh.holdExpiresAt && fresh.holdExpiresAt <= now) {
        await released(tx, fresh, 'expired', now);
        n++;
      }
    });
  return n;
}

// ───────────── Espacios y día ─────────────

export async function listVenues(db: Db, opts: { includeInactive?: boolean } = {}) {
  return db.venue.findMany({ where: opts.includeInactive ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
}

/** Agenda de un día: cada espacio con sus ocupaciones vigentes (hora del club). */
export async function agendaDay(db: Db, day: string, venueIds?: string[], now = new Date()) {
  const venues = (await listVenues(db)).filter((v) => !venueIds || venueIds.includes(v.id));
  const from = clubTime(day, 0);
  const to = clubTime(day, 24 * 60);
  const slots = await occupancy(
    db,
    venues.map((v) => v.id),
    from,
    to,
    now,
  );
  return venues.map((v) => ({
    venue: v,
    slots: slots
      .filter((s) => s.venueId === v.id)
      .map((s) => ({
        ...s,
        fromMinute: Math.max(0, Math.round((s.startsAt.getTime() - from.getTime()) / 60_000)),
        toMinute: Math.min(24 * 60, Math.round((s.endsAt.getTime() - from.getTime()) / 60_000)),
      })),
  }));
}
