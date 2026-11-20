/**
 * Reservas fijas: el encargado reserva el mismo turno todas las semanas entre dos fechas (por ejemplo,
 * «Pádel 2 · martes 20:00 · marzo a junio»). Cada semana es una reserva común —ocupa la agenda y deja su
 * cargo en la cuenta de la persona para pagar en el club—, así que se cancela una sola o la serie entera.
 * Las semanas que chocan con algo ya ocupado no se reservan y se informan.
 */
import { clubDayOf, clubTime } from '@clumera/agenda';
import type { PrismaClient } from '@clumera/db';
import { DomainError, type Result } from '@clumera/kernel';
import { bookingTitle, cancelBooking, createBooking } from './bookings';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Tope de semanas por serie (medio año): evita cargar cientos de cargos por error. */
export const MAX_SERIES_WEEKS = 26;
/** Motivo de las semanas canceladas junto con la serie (los avisos se agrupan). */
export const SERIES_CANCEL_REASON = 'Reserva fija cancelada';
export const WEEKDAY_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** 0 = lunes … 6 = domingo. */
const weekdayOf = (day: string) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Días de la serie, en orden, desde el primer `weekday` en o después de `fromDay`. */
export function seriesDays(weekday: number, fromDay: string, untilDay: string): string[] {
  const out: string[] = [];
  let d = addDays(fromDay, (weekday - weekdayOf(fromDay) + 7) % 7);
  while (d <= untilDay && out.length <= MAX_SERIES_WEEKS) {
    out.push(d);
    d = addDays(d, 7);
  }
  return out;
}

export interface SeriesInput {
  venueId: string;
  personId: string;
  weekday: number;
  startMinute: number;
  fromDay: string;
  untilDay: string;
  label?: string;
}

export interface SeriesOutcome {
  id: string;
  booked: string[];
  skipped: Array<{ day: string; reason: string }>;
}

export async function createBookingSeries(db: PrismaClient, actorPersonId: string, input: SeriesInput, now = new Date()): Promise<Result<SeriesOutcome>> {
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) return fail('invalid_input', 'Elegí el día de la semana');
  if (!Number.isInteger(input.startMinute) || input.startMinute < 0 || input.startMinute > 1439) return fail('invalid_input', 'Elegí el horario');
  if (!DAY.test(input.fromDay) || !DAY.test(input.untilDay) || input.fromDay > input.untilDay) return fail('invalid_input', 'Revisá las fechas');
  const today = clubDayOf(now).day;
  const fromDay = input.fromDay < today ? today : input.fromDay;
  const days = seriesDays(input.weekday, fromDay, input.untilDay).filter((d) => clubTime(d, input.startMinute) > now);
  if (!days.length) return fail('invalid_input', 'No hay ninguna fecha futura en ese rango');
  if (days.length > MAX_SERIES_WEEKS) return fail('invalid_input', `Una reserva fija abarca hasta ${MAX_SERIES_WEEKS} semanas`);
  const [venue, person] = await Promise.all([
    db.venue.findUnique({ where: { id: input.venueId }, include: { rule: true } }),
    db.person.findUnique({ where: { id: input.personId }, select: { firstName: true, lastName: true } }),
  ]);
  if (!venue?.active || !venue.rule) return fail('not_found', 'Ese espacio no se reserva');
  if (!person) return fail('not_found', 'Persona inexistente');
  const rule = venue.rule;
  if (input.startMinute < rule.openFrom || input.startMinute + rule.slotMinutes > rule.openTo || (input.startMinute - rule.openFrom) % rule.slotMinutes !== 0)
    return fail('invalid_input', 'Ese horario no es un turno de este espacio');

  const label = input.label?.trim().slice(0, 80) || `${person.firstName} ${person.lastName}`;
  const series = await db.bookingSeries.create({
    data: { venueId: venue.id, personId: input.personId, weekday: input.weekday, startMinute: input.startMinute, fromDay, untilDay: input.untilDay, label, createdById: actorPersonId },
  });
  const booked: string[] = [];
  const skipped: SeriesOutcome['skipped'] = [];
  for (const day of days) {
    const r = await createBooking(db, actorPersonId, { personId: input.personId, venueId: venue.id, startsAt: clubTime(day, input.startMinute), payMode: 'club', seriesId: series.id }, now);
    if (r.ok) booked.push(day);
    else skipped.push({ day, reason: r.error.message });
  }
  if (!booked.length) {
    await db.bookingSeries.update({ where: { id: series.id }, data: { status: 'cancelled', cancelledAt: now } });
    return fail('conflict', 'Ninguna semana estaba libre: no se cargó la reserva fija');
  }
  await db.auditLog.create({ data: { actorPersonId, action: 'booking.series_created', entityType: 'person', entityId: input.personId, diff: { seriesId: series.id, venueId: venue.id, booked: booked.length, skipped: skipped.length } } });
  return { ok: true, value: { id: series.id, booked, skipped } };
}

/** Cancela la serie: todas las semanas que todavía no empezaron (como encargado). */
export async function cancelBookingSeries(db: PrismaClient, actorPersonId: string, seriesId: string, now = new Date()): Promise<Result<{ cancelled: number; personId: string }>> {
  const s = await db.bookingSeries.findUnique({ where: { id: seriesId } });
  if (!s) return fail('not_found', 'Reserva fija inexistente');
  if (s.status === 'cancelled') return fail('conflict', 'La reserva fija ya está cancelada');
  const pending = await db.booking.findMany({ where: { seriesId, status: { in: ['held', 'confirmed'] }, startsAt: { gt: now } }, select: { id: true } });
  let cancelled = 0;
  for (const b of pending) {
    const r = await cancelBooking(db, actorPersonId, b.id, { byManager: true, reason: SERIES_CANCEL_REASON }, now);
    if (r.ok) cancelled++;
  }
  await db.bookingSeries.update({ where: { id: seriesId }, data: { status: 'cancelled', cancelledAt: now } });
  await db.auditLog.create({ data: { actorPersonId, action: 'booking.series_cancelled', entityType: 'person', entityId: s.personId, diff: { seriesId, cancelled } } });
  return { ok: true, value: { cancelled, personId: s.personId } };
}

/** Reservas fijas vigentes de los espacios dados (para el encargado). */
export async function listBookingSeries(db: PrismaClient, venueIds?: string[], now = new Date()) {
  const rows = await db.bookingSeries.findMany({
    where: { status: 'active', untilDay: { gte: clubDayOf(now).day }, ...(venueIds ? { venueId: { in: venueIds } } : {}) },
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    include: {
      venue: { select: { name: true } },
      person: { select: { firstName: true, lastName: true } },
      bookings: { where: { status: { in: ['held', 'confirmed'] }, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    venueId: s.venueId,
    venueName: s.venue.name,
    label: s.label,
    person: `${s.person.firstName} ${s.person.lastName}`,
    when: `${WEEKDAY_LABEL[s.weekday]} ${String(Math.floor(s.startMinute / 60)).padStart(2, '0')}:${String(s.startMinute % 60).padStart(2, '0')}`,
    fromDay: s.fromDay,
    untilDay: s.untilDay,
    upcoming: s.bookings.length,
    next: s.bookings[0] ? bookingTitle(s.venue.name, s.bookings[0].startsAt) : null,
  }));
}
