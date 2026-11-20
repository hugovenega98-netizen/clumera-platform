/**
 * Reservas de socios: turnero sobre la agenda central, precio por franja (tarifa socio o no socio),
 * seña o pago completo con Mercado Pago (Finanzas) o pago en el club, liberación automática del
 * turno retenido y cancelación con plazo.
 *
 * Flujo online: reservar → turno retenido (la agenda lo aparta unos minutos) + cargo emitido →
 * pago con el checkout de Finanzas → `payment.approved` confirma la reserva. Si el pago llega con la
 * retención vencida, se confirma solo si nadie tomó el turno; si no, queda en «conflicto» para que
 * el club devuelva el pago. Nunca dos reservas confirmadas en el mismo turno.
 */
import { AGENDA_LABEL, activeWhere, clubDayOf, clubTime, confirmSlotTx, extendHoldTx, placeSlotTx, releaseSlotTx } from '@clumera/agenda';
import { appendOutbox, type Prisma, type PrismaClient } from '@clumera/db';
import { cancelCharge, issueCharge } from '@clumera/finance';
import { membershipActive } from '@clumera/identity';
import { createEvent, DomainError, type Result } from '@clumera/kernel';

type Tx = Prisma.TransactionClient;
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string, details?: Record<string, unknown>) => ({ ok: false, error: new DomainError(code, message, details) }) as const;

export type PayMode = 'full' | 'deposit' | 'club';
/** Un pago online en curso puede estirar la retención hasta esto desde que se reservó. */
export const MAX_HOLD_MINUTES = 60;

const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** «Pádel 2 · sáb 21/11 18:00». */
export function bookingTitle(venueName: string, startsAt: Date): string {
  const { day, minutes, weekday } = clubDayOf(startsAt);
  return `${venueName} · ${DAY_SHORT[weekday]!.toLowerCase()} ${ddmm(day)} ${hhmm(minutes)}`;
}

// ───────────── Catálogo y precios ─────────────

/** Espacios reservables (activos, con regla y al menos una tarifa), agrupados para el turnero. */
export async function bookableVenues(db: PrismaClient) {
  const venues = await db.venue.findMany({
    where: { active: true, rule: { isNot: null }, tariffs: { some: {} } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { rule: true, tariffs: true },
  });
  return venues.map((v) => ({ ...v, rule: v.rule! }));
}

export interface PriceTariff {
  label: string;
  days: number;
  fromMinute: number;
  toMinute: number;
  memberPrice: number;
  guestPrice: number;
}

/** Tarifa que cubre el inicio del turno (día de la semana y horario del club). */
export function tariffFor<T extends PriceTariff>(tariffs: T[], startsAt: Date): T | null {
  const { minutes, weekday } = clubDayOf(startsAt);
  return tariffs.find((t) => (t.days & (1 << weekday)) !== 0 && minutes >= t.fromMinute && minutes < t.toMinute) ?? null;
}

export async function isMember(db: PrismaClient | Tx, personId: string, at = new Date()): Promise<boolean> {
  const m = await db.clubMembership.findFirst({ where: { personId }, orderBy: { validFrom: 'desc' }, select: { status: true, validFrom: true, validTo: true } });
  return membershipActive(m ?? undefined, at);
}

export interface PayOption {
  mode: PayMode;
  amount: number;
  available: boolean;
  note: string;
}

export function payOptions(price: number, rule: { depositPercent: number; payAtClub: boolean }): PayOption[] {
  const deposit = Math.round((price * rule.depositPercent) / 100);
  return [
    { mode: 'full', amount: price, available: price > 0, note: 'Mercado Pago' },
    { mode: 'deposit', amount: deposit, available: rule.depositPercent > 0 && rule.depositPercent < 100 && deposit > 0, note: `Seña ${rule.depositPercent}% · saldo en el club` },
    { mode: 'club', amount: 0, available: rule.payAtClub || price === 0, note: price === 0 ? 'Sin cargo' : 'Se paga en el club antes de jugar' },
  ];
}

// ───────────── Disponibilidad ─────────────

export type SlotState = 'free' | 'busy' | 'past' | 'closed';
export interface TurnSlot {
  startsAt: Date;
  endsAt: Date;
  start: string;
  state: SlotState;
  label: string;
  price: number | null;
}

/** Turnos de un día para un espacio: libres, ocupados (con motivo, sin datos de terceros) o pasados. */
export async function availability(db: PrismaClient, venueId: string, day: string, member: boolean, now = new Date()): Promise<TurnSlot[] | null> {
  const v = await db.venue.findUnique({ where: { id: venueId }, include: { rule: true, tariffs: true } });
  if (!v?.active || !v.rule) return null;
  const rule = v.rule;
  const today = clubDayOf(now).day;
  const lastDay = clubDayOf(new Date(now.getTime() + rule.maxAdvanceDays * 86_400_000)).day;
  const outOfRange = day < today || day > lastDay;
  const busy = await db.agendaSlot.findMany({
    where: { venueId, startsAt: { lt: clubTime(day, rule.openTo) }, endsAt: { gt: clubTime(day, rule.openFrom) }, ...activeWhere(now) },
    select: { startsAt: true, endsAt: true, kind: true, label: true },
  });
  const out: TurnSlot[] = [];
  for (let m = rule.openFrom; m + rule.slotMinutes <= rule.openTo; m += rule.slotMinutes) {
    const startsAt = clubTime(day, m);
    const endsAt = clubTime(day, m + rule.slotMinutes);
    const hit = busy.find((b) => b.startsAt < endsAt && b.endsAt > startsAt);
    const tariff = tariffFor(v.tariffs, startsAt);
    let state: SlotState = 'free';
    let label = 'Libre';
    if (v.status !== 'available') [state, label] = ['closed', v.status === 'maintenance' ? 'Mantenimiento' : 'Fuera de servicio'];
    else if (outOfRange || startsAt <= now) [state, label] = ['past', outOfRange && day > lastDay ? 'Todavía no' : 'Pasado'];
    else if (hit) [state, label] = ['busy', hit.kind === 'block' ? hit.label || 'Bloqueado' : AGENDA_LABEL[hit.kind]];
    else if (!tariff) [state, label] = ['closed', 'Cerrado'];
    out.push({ startsAt, endsAt, start: hhmm(m), state, label, price: tariff ? (member ? tariff.memberPrice : tariff.guestPrice) : null });
  }
  return out;
}

// ───────────── Reservar ─────────────

export interface BookInput {
  personId: string;
  venueId: string;
  startsAt: Date;
  payMode: PayMode;
}

/**
 * Reserva un turno. Online (completo o seña): retiene el turno y emite el cargo; la reserva se
 * confirma con el pago. En el club: confirma el turno y deja el cargo pendiente.
 */
export async function createBooking(db: PrismaClient, actorPersonId: string, input: BookInput, now = new Date()): Promise<Result<{ id: string; status: 'held' | 'confirmed'; chargeId: string | null; amount: number; holdExpiresAt: Date | null }>> {
  const v = await db.venue.findUnique({ where: { id: input.venueId }, include: { rule: true, tariffs: true } });
  if (!v?.active || !v.rule) return fail('not_found', 'Ese espacio no se reserva online');
  const rule = v.rule;
  const { day, minutes } = clubDayOf(input.startsAt);
  if (minutes < rule.openFrom || minutes + rule.slotMinutes > rule.openTo || (minutes - rule.openFrom) % rule.slotMinutes !== 0) return fail('invalid_input', 'Ese horario no es un turno de este espacio');
  if (input.startsAt <= now) return fail('invalid_input', 'Ese turno ya pasó');
  if (day > clubDayOf(new Date(now.getTime() + rule.maxAdvanceDays * 86_400_000)).day) return fail('invalid_input', `Se reserva con hasta ${rule.maxAdvanceDays} días de anticipación`);
  const tariff = tariffFor(v.tariffs, input.startsAt);
  if (!tariff) return fail('invalid_input', 'Ese horario no tiene tarifa: el espacio está cerrado');
  const member = await isMember(db, input.personId, now);
  const price = member ? tariff.memberPrice : tariff.guestPrice;
  const option = payOptions(price, rule).find((o) => o.mode === input.payMode);
  if (!option?.available) return fail('invalid_input', 'Esa forma de pago no está habilitada para este espacio');
  const endsAt = new Date(input.startsAt.getTime() + rule.slotMinutes * 60_000);
  const online = input.payMode !== 'club';
  // Una reserva sin pagar por persona y espacio a la vez: evita acaparar turnos retenidos.
  const pendingHold = await db.booking.findFirst({ where: { personId: input.personId, status: 'held', holdExpiresAt: { gt: now } }, select: { id: true } });
  if (online && pendingHold) return fail('conflict', 'Tenés otra reserva esperando el pago: terminala o esperá a que se libere', { bookingId: pendingHold.id });

  let booking: { id: string; holdExpiresAt: Date | null; status: 'held' | 'confirmed' };
  try {
    booking = await db.$transaction(async (tx) => {
      const b = await tx.booking.create({
        data: {
          venueId: v.id,
          personId: input.personId,
          startsAt: input.startsAt,
          endsAt,
          status: online ? 'held' : 'confirmed',
          payMode: input.payMode,
          price,
          chargeAmount: input.payMode === 'club' ? 0 : option.amount,
          memberRate: member,
          holdExpiresAt: online ? new Date(now.getTime() + rule.holdMinutes * 60_000) : null,
          createdById: actorPersonId,
        },
      });
      const slot = await placeSlotTx(
        tx,
        { venueId: v.id, startsAt: input.startsAt, endsAt, kind: 'booking', label: 'Reserva', source: 'bookings', sourceRef: b.id, createdById: actorPersonId, holdMinutes: online ? rule.holdMinutes : undefined },
        now,
      );
      if (!slot.ok) throw slot.error;
      await tx.booking.update({ where: { id: b.id }, data: { slotId: slot.value.id } });
      await appendOutbox(tx, createEvent(online ? 'booking.held' : 'booking.confirmed', 'bookings', { bookingId: b.id, personId: input.personId }));
      return { id: b.id, holdExpiresAt: b.holdExpiresAt, status: b.status as 'held' | 'confirmed' };
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.code === 'conflict' ? new DomainError('conflict', 'Ese turno ya no está libre: elegí otro', e.details) : e };
    throw e;
  }

  // El cargo va a la cuenta de la persona (Finanzas). En el club: el total; online: lo que se paga ahora.
  const amount = input.payMode === 'club' ? price : option.amount;
  let chargeId: string | null = null;
  if (amount > 0) {
    const title = bookingTitle(v.name, input.startsAt);
    const c = await issueCharge(db, actorPersonId, {
      personId: input.personId,
      concept: 'reserva',
      groupLabel: 'Reservas',
      description: input.payMode === 'deposit' ? `Seña reserva ${title}` : `Reserva ${title}`,
      amount,
      dueDate: new Date(`${input.payMode === 'club' ? day : clubDayOf(now).day}T00:00:00Z`),
      source: 'bookings',
      sourceRef: booking.id,
    });
    if (!c.ok) {
      await expireBooking(db, booking.id, 'No se pudo emitir el cargo', now);
      return c;
    }
    chargeId = c.value.id;
    await db.booking.update({ where: { id: booking.id }, data: { chargeId } });
  }
  return { ok: true, value: { id: booking.id, status: booking.status, chargeId, amount, holdExpiresAt: booking.holdExpiresAt } };
}

// ───────────── Pago, vencimiento y cancelación ─────────────

/**
 * Consumidor de `payment.approved`: confirma las reservas de los cargos pagados. Corre dentro de la
 * transacción del outbox. Devuelve qué pasó con cada una para avisar.
 */
export async function confirmPaidBookings(tx: Tx, chargeIds: string[], now = new Date()): Promise<Array<{ id: string; personId: string; outcome: 'confirmed' | 'conflict'; title: string }>> {
  if (!chargeIds.length) return [];
  const list = await tx.booking.findMany({ where: { chargeId: { in: chargeIds }, status: { in: ['held', 'expired'] } }, include: { venue: { select: { name: true } } } });
  const out = [];
  for (const b of list) {
    const title = bookingTitle(b.venue.name, b.startsAt);
    let slotId = b.slotId;
    let ok = false;
    if (slotId) ok = (await confirmSlotTx(tx, slotId, now)).ok;
    if (!slotId || !ok) {
      // Sin ocupación (se borró) o tomada: intentar ocupar de nuevo, confirmada.
      const again = slotId ? null : await placeSlotTx(tx, { venueId: b.venueId, startsAt: b.startsAt, endsAt: b.endsAt, kind: 'booking', label: 'Reserva', source: 'bookings', sourceRef: b.id }, now);
      if (again?.ok) {
        slotId = again.value.id;
        ok = true;
      }
    }
    if (ok) {
      await tx.booking.update({ where: { id: b.id }, data: { status: 'confirmed', slotId, holdExpiresAt: null } });
      await appendOutbox(tx, createEvent('booking.confirmed', 'bookings', { bookingId: b.id, personId: b.personId }));
      out.push({ id: b.id, personId: b.personId, outcome: 'confirmed' as const, title });
    } else {
      // Pagó tarde y otro tomó el turno: el club devuelve lo pagado.
      const paid = (await tx.charge.findUnique({ where: { id: b.chargeId! }, select: { paidAmount: true } }))?.paidAmount ?? 0;
      await tx.booking.update({ where: { id: b.id }, data: { status: 'conflict', refundDue: paid, holdExpiresAt: null } });
      await appendOutbox(tx, createEvent('booking.conflict', 'bookings', { bookingId: b.id, personId: b.personId }));
      out.push({ id: b.id, personId: b.personId, outcome: 'conflict' as const, title });
    }
  }
  return out;
}

async function expireBooking(db: PrismaClient, bookingId: string, reason: string, now: Date) {
  const b = await db.booking.findUnique({ where: { id: bookingId } });
  if (!b || b.status !== 'held') return;
  await db.$transaction(async (tx) => {
    if (b.slotId) await releaseSlotTx(tx, b.slotId, now);
    await tx.booking.update({ where: { id: b.id }, data: { status: 'expired', cancelReason: reason } });
    await appendOutbox(tx, createEvent('booking.released', 'bookings', { bookingId: b.id, personId: b.personId }));
  });
  if (b.chargeId) await cancelCharge(db, b.createdById ?? b.personId, b.chargeId, 'Turno retenido vencido sin pago').catch(() => null);
}

/**
 * Barrido de retenciones vencidas. Si hay un pago online en curso para el cargo, estira la retención
 * (hasta MAX_HOLD_MINUTES desde la reserva); si no, libera el turno y anula el cargo.
 */
export async function sweepExpiredBookings(db: PrismaClient, now = new Date()): Promise<{ expired: number; extended: number }> {
  const due = await db.booking.findMany({ where: { status: 'held', holdExpiresAt: { lte: now } }, take: 200 });
  let expired = 0;
  let extended = 0;
  for (const b of due) {
    const cap = new Date(b.createdAt.getTime() + MAX_HOLD_MINUTES * 60_000);
    const paying = b.chargeId ? await db.payment.findFirst({ where: { status: 'pending', intent: { has: b.chargeId } }, select: { id: true } }) : null;
    if (paying && now < cap && b.slotId) {
      const until = new Date(Math.min(cap.getTime(), now.getTime() + 10 * 60_000));
      await db.$transaction(async (tx) => {
        await extendHoldTx(tx, b.slotId!, until);
        await tx.booking.update({ where: { id: b.id }, data: { holdExpiresAt: until } });
      });
      extended++;
    } else {
      await expireBooking(db, b.id, 'Venció el tiempo para pagar', now);
      expired++;
    }
  }
  return { expired, extended };
}

/**
 * Cancelar. La persona: hasta `cancelHours` antes (después se retiene lo pagado). El encargado:
 * siempre. Si se pagó algo y se cancela a tiempo (o la cancela el club), queda el reintegro pendiente.
 */
export async function cancelBooking(
  db: PrismaClient,
  actorPersonId: string,
  bookingId: string,
  opts: { byManager: boolean; reason?: string },
  now = new Date(),
): Promise<Result<{ status: 'cancelled'; refundDue: number }>> {
  const b = await db.booking.findUnique({ where: { id: bookingId }, include: { venue: { include: { rule: true } } } });
  if (!b) return fail('not_found', 'Reserva inexistente');
  if (b.status !== 'confirmed' && b.status !== 'held') return fail('conflict', 'La reserva ya no está vigente');
  if (b.startsAt <= now) return fail('conflict', 'El turno ya empezó');
  const hours = b.venue.rule?.cancelHours ?? 24;
  const onTime = b.startsAt.getTime() - now.getTime() >= hours * 3_600_000;
  if (!opts.byManager && !onTime && b.status === 'confirmed') return fail('conflict', `Se cancela online hasta ${hours} h antes. Comunicate con el club.`);
  const charge = b.chargeId ? await db.charge.findUnique({ where: { id: b.chargeId }, select: { paidAmount: true, status: true } }) : null;
  const paid = charge?.paidAmount ?? 0;
  const refundDue = paid > 0 && (onTime || opts.byManager) ? paid : 0;
  await db.$transaction(async (tx) => {
    if (b.slotId) await releaseSlotTx(tx, b.slotId, now);
    await tx.booking.update({ where: { id: b.id }, data: { status: 'cancelled', cancelledAt: now, cancelReason: opts.reason?.trim().slice(0, 200) || (opts.byManager ? 'Cancelada por el club' : 'Cancelada por la persona'), refundDue, holdExpiresAt: null } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'booking.cancelled', entityType: 'person', entityId: b.personId, diff: { bookingId: b.id, onTime, refundDue } } });
    await appendOutbox(tx, createEvent('booking.cancelled', 'bookings', { bookingId: b.id, personId: b.personId, byManager: opts.byManager }));
  });
  // Lo no pagado se anula; lo pagado queda (reintegro o seña retenida).
  if (b.chargeId && charge?.status === 'pending' && paid === 0) await cancelCharge(db, actorPersonId, b.chargeId, 'Reserva cancelada').catch(() => null);
  return { ok: true, value: { status: 'cancelled', refundDue } };
}

// ───────────── Consultas ─────────────

export async function myBookings(db: PrismaClient, personIds: string[], now = new Date()) {
  const rows = await db.booking.findMany({
    where: { personId: { in: personIds }, OR: [{ startsAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } }, { status: { in: ['held', 'conflict'] } }] },
    orderBy: { startsAt: 'asc' },
    take: 50,
    include: { venue: { select: { name: true, group: true, rule: { select: { cancelHours: true } } } }, person: { select: { firstName: true } } },
  });
  const charges = await db.charge.findMany({ where: { id: { in: rows.flatMap((r) => (r.chargeId ? [r.chargeId] : [])) } }, select: { id: true, amount: true, paidAmount: true, status: true } });
  const byId = new Map(charges.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = r.chargeId ? byId.get(r.chargeId) : undefined;
    const hours = r.venue.rule?.cancelHours ?? 24;
    return {
      ...r,
      title: bookingTitle(r.venue.name, r.startsAt),
      paid: c?.paidAmount ?? 0,
      pending: c && c.status === 'pending' ? c.amount - c.paidAmount : 0,
      cancellable: (r.status === 'confirmed' || r.status === 'held') && r.startsAt > now && (r.status === 'held' || r.startsAt.getTime() - now.getTime() >= hours * 3_600_000),
      cancelHours: hours,
    };
  });
}

/** Reservas de un día para el encargado (con nombre de quien reservó). */
export async function dayBookings(db: PrismaClient, day: string, venueIds?: string[]) {
  return db.booking.findMany({
    where: { startsAt: { gte: clubTime(day, 0), lt: clubTime(day, 24 * 60) }, ...(venueIds ? { venueId: { in: venueIds } } : {}) },
    orderBy: [{ startsAt: 'asc' }],
    include: { venue: { select: { name: true, slug: true } }, person: { select: { firstName: true, lastName: true } } },
  });
}

/** Reintegros pendientes (cancelaciones a tiempo o conflictos de pago tardío) para Contabilidad. */
export async function refundsDue(db: PrismaClient) {
  return db.booking.findMany({ where: { refundDue: { gt: 0 } }, orderBy: { updatedAt: 'desc' }, take: 50, include: { venue: { select: { name: true } }, person: { select: { firstName: true, lastName: true } } } });
}
