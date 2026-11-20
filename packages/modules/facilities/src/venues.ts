/**
 * Instalaciones: espacios, su estado físico, reglas y tarifas de reserva y bloqueos en la agenda.
 * La ocupación horaria la decide la agenda central; acá se administra el espacio en sí.
 */
import { AGENDA_LABEL, clubTime, placeSlot, releaseSlotTx } from '@clumera/agenda';
import type { PrismaClient } from '@clumera/db';
import { DomainError, type Result } from '@clumera/kernel';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string, details?: Record<string, unknown>) => ({ ok: false, error: new DomainError(code, message, details) }) as const;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VENUE_STATUSES = ['available', 'maintenance', 'out_of_service'] as const;
export type VenueStatusName = (typeof VENUE_STATUSES)[number];
export const VENUE_STATUS_LABEL: Record<VenueStatusName, string> = { available: 'Disponible', maintenance: 'En mantenimiento', out_of_service: 'Fuera de servicio' };

export interface VenueInput {
  name: string;
  slug: string;
  group: string;
  detail?: string;
  sortOrder?: number;
}

export async function createVenue(db: PrismaClient, actorPersonId: string, input: VenueInput): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 60);
  const group = input.group.trim().slice(0, 40);
  if (!name || !group) return fail('invalid_input', 'Completá nombre y tipo de espacio');
  if (!SLUG.test(input.slug)) return fail('invalid_input', 'El identificador va en minúsculas, números y guiones');
  if (await db.venue.findUnique({ where: { slug: input.slug } })) return fail('conflict', 'Ya hay un espacio con ese identificador');
  const v = await db.$transaction(async (tx) => {
    const venue = await tx.venue.create({ data: { name, slug: input.slug, group, detail: input.detail?.trim().slice(0, 60) ?? '', sortOrder: input.sortOrder ?? 0 } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'venue.created', entityType: 'venue', entityId: venue.id, diff: { name, group } } });
    return venue;
  });
  return { ok: true, value: { id: v.id } };
}

/** Estado físico (independiente de la ocupación horaria). */
export async function setVenueStatus(db: PrismaClient, actorPersonId: string, venueId: string, status: VenueStatusName, note = ''): Promise<Result<{ status: VenueStatusName }>> {
  if (!VENUE_STATUSES.includes(status)) return fail('invalid_input', 'Estado inválido');
  const v = await db.venue.findUnique({ where: { id: venueId }, select: { status: true } });
  if (!v) return fail('not_found', 'Espacio inexistente');
  await db.$transaction(async (tx) => {
    await tx.venue.update({ where: { id: venueId }, data: { status, statusNote: status === 'available' ? '' : note.trim().slice(0, 120) } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'venue.status_changed', entityType: 'venue', entityId: venueId, diff: { from: v.status, to: status } } });
  });
  return { ok: true, value: { status } };
}

export interface RuleInput {
  slotMinutes: number;
  openFrom: number;
  openTo: number;
  maxAdvanceDays: number;
  holdMinutes: number;
  cancelHours: number;
  depositPercent: number;
  payAtClub: boolean;
  /** Se puede reservar sin cuenta desde /reservar (tarifa general, pago online). */
  publicBooking?: boolean;
}

export async function setBookingRule(db: PrismaClient, actorPersonId: string, venueId: string, rule: RuleInput): Promise<Result<{ venueId: string }>> {
  const okRange = rule.slotMinutes >= 15 && rule.slotMinutes <= 480 && rule.openFrom >= 0 && rule.openTo <= 1440 && rule.openFrom < rule.openTo;
  if (!okRange || (rule.openTo - rule.openFrom) % rule.slotMinutes !== 0) return fail('invalid_input', 'El horario tiene que dividirse en turnos enteros');
  if (rule.depositPercent < 0 || rule.depositPercent > 100 || rule.holdMinutes < 2 || rule.holdMinutes > 60) return fail('invalid_input', 'Revisá la seña y la retención');
  if (!(await db.venue.findUnique({ where: { id: venueId }, select: { id: true } }))) return fail('not_found', 'Espacio inexistente');
  await db.$transaction(async (tx) => {
    await tx.bookingRule.upsert({ where: { venueId }, create: { venueId, ...rule }, update: rule });
    await tx.auditLog.create({ data: { actorPersonId, action: 'venue.rule_changed', entityType: 'venue', entityId: venueId, diff: { ...rule } } });
  });
  return { ok: true, value: { venueId } };
}

export interface TariffInput {
  label: string;
  days: number;
  fromMinute: number;
  toMinute: number;
  memberPrice: number;
  guestPrice: number;
}

export async function addTariff(db: PrismaClient, actorPersonId: string, venueId: string, t: TariffInput): Promise<Result<{ id: string }>> {
  if (!t.label.trim() || t.days < 1 || t.days > 127 || t.fromMinute < 0 || t.toMinute > 1440 || t.fromMinute >= t.toMinute) return fail('invalid_input', 'Revisá días y horario de la tarifa');
  if (!Number.isSafeInteger(t.memberPrice) || !Number.isSafeInteger(t.guestPrice) || t.memberPrice < 0 || t.guestPrice < 0) return fail('invalid_input', 'Precio inválido');
  const overlap = await db.tariff.findFirst({ where: { venueId, fromMinute: { lt: t.toMinute }, toMinute: { gt: t.fromMinute } }, select: { days: true, label: true } });
  if (overlap && overlap.days & t.days) return fail('conflict', `Se superpone con la tarifa «${overlap.label}»`);
  const r = await db.$transaction(async (tx) => {
    const tariff = await tx.tariff.create({ data: { venueId, ...t, label: t.label.trim().slice(0, 40) } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'venue.tariff_added', entityType: 'venue', entityId: venueId, diff: { label: tariff.label, memberPrice: t.memberPrice, guestPrice: t.guestPrice } } });
    return tariff;
  });
  return { ok: true, value: { id: r.id } };
}

export async function removeTariff(db: PrismaClient, actorPersonId: string, tariffId: string): Promise<Result<{ id: string }>> {
  const t = await db.tariff.findUnique({ where: { id: tariffId } });
  if (!t) return fail('not_found', 'Tarifa inexistente');
  await db.$transaction(async (tx) => {
    await tx.tariff.delete({ where: { id: tariffId } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'venue.tariff_removed', entityType: 'venue', entityId: t.venueId, diff: { label: t.label } } });
  });
  return { ok: true, value: { id: tariffId } };
}

/** Bloqueo (mantenimiento, armado de un evento): máxima prioridad en la agenda. */
export async function createBlock(
  db: PrismaClient,
  actorPersonId: string,
  input: { venueId: string; day: string; fromMinute: number; toMinute: number; reason: string },
  now = new Date(),
): Promise<Result<{ id: string; displaced: string[] }>> {
  const reason = input.reason.trim().slice(0, 80);
  if (!reason) return fail('invalid_input', 'Indicá el motivo del bloqueo');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.day) || input.fromMinute < 0 || input.toMinute > 1440 || input.fromMinute >= input.toMinute) return fail('invalid_input', 'Horario inválido');
  const r = await placeSlot(
    db,
    { venueId: input.venueId, startsAt: clubTime(input.day, input.fromMinute), endsAt: clubTime(input.day, input.toMinute), kind: 'block', label: reason, source: 'facilities', sourceRef: `block:${input.day}:${input.fromMinute}:${now.getTime()}`, createdById: actorPersonId },
    now,
  );
  if (!r.ok) {
    const by = (r.error.details?.by as Array<{ kind: keyof typeof AGENDA_LABEL; label: string }> | undefined) ?? [];
    return by.length ? fail('conflict', `Hay ocupaciones confirmadas en ese horario: ${by.map((b) => b.label || AGENDA_LABEL[b.kind]).join(', ')}. Cancelalas o elegí otro horario.`) : r;
  }
  await db.auditLog.create({ data: { actorPersonId, action: 'venue.blocked', entityType: 'venue', entityId: input.venueId, diff: { day: input.day, from: input.fromMinute, to: input.toMinute, reason } } });
  return r;
}

export async function removeBlock(db: PrismaClient, actorPersonId: string, slotId: string): Promise<Result<{ id: string }>> {
  const s = await db.agendaSlot.findUnique({ where: { id: slotId }, select: { kind: true, venueId: true, label: true, status: true } });
  if (!s || s.kind !== 'block') return fail('not_found', 'Bloqueo inexistente');
  await db.$transaction(async (tx) => {
    await releaseSlotTx(tx, slotId);
    await tx.auditLog.create({ data: { actorPersonId, action: 'venue.unblocked', entityType: 'venue', entityId: s.venueId, diff: { reason: s.label } } });
  });
  return { ok: true, value: { id: slotId } };
}

/** Espacios con su regla y tarifas, para administrarlos. */
export async function venuesAdmin(db: PrismaClient) {
  return db.venue.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { rule: true, tariffs: { orderBy: [{ fromMinute: 'asc' }] } } });
}
