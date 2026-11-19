/**
 * Libro de Finanzas: cargos (lo que se debe), cobros (lo que entra) e imputaciones (qué cobro cancela
 * qué cargo). Ningún módulo arma su propio sistema de cobros: emiten cargos acá con `source` +
 * `sourceRef` y escuchan `payment.approved` en el outbox.
 *
 * Reglas:
 * - Montos en centavos, siempre enteros y positivos (también hay CHECK en la base).
 * - Un cargo nunca recibe más de lo que vale; las imputaciones se hacen con las filas bloqueadas.
 * - Un pago de la pasarela se imputa recién cuando llega `approved`; los webhooks repetidos se
 *   registran en la bitácora y no cambian nada.
 */
import { appendOutbox, type Prisma, type PrismaClient } from '@clumera/db';
import { createEvent, DomainError, type Result } from '@clumera/kernel';

type Tx = Prisma.TransactionClient;
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string, details?: Record<string, unknown>) =>
  ({ ok: false, error: new DomainError(code, message, details) }) as const;

export interface ChargeInput {
  personId: string;
  concept: string;
  groupLabel: string;
  description: string;
  period?: string | null;
  amount: number;
  dueDate: Date;
  source: string;
  sourceRef: string;
}

function validAmount(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0 && n <= 1_000_000_000_00;
}

/** Emite un cargo. Repetir la misma `source` + `sourceRef` devuelve el existente sin duplicar. */
export async function issueCharge(db: PrismaClient, actorPersonId: string | null, input: ChargeInput): Promise<Result<{ id: string; created: boolean }>> {
  if (!validAmount(input.amount)) return fail('invalid_input', 'El monto tiene que ser mayor a cero');
  if (!input.description.trim()) return fail('invalid_input', 'Falta el concepto');
  if (input.period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) return fail('invalid_input', 'Período inválido (AAAA-MM)');
  const existing = await db.charge.findUnique({ where: { source_sourceRef: { source: input.source, sourceRef: input.sourceRef } }, select: { id: true } });
  if (existing) return { ok: true, value: { id: existing.id, created: false } };
  if (!(await db.person.findUnique({ where: { id: input.personId }, select: { id: true } }))) return fail('not_found', 'Persona inexistente');
  const id = await db.$transaction(async (tx) => {
    const c = await tx.charge.create({
      data: { ...input, description: input.description.trim(), period: input.period ?? null, issuedById: actorPersonId },
    });
    await appendOutbox(tx, createEvent('charge.issued', 'finance', { chargeId: c.id, personId: c.personId, amount: c.amount, concept: c.concept }));
    if (actorPersonId)
      await tx.auditLog.create({ data: { actorPersonId, action: 'charge.issued', entityType: 'person', entityId: c.personId, diff: { description: c.description, amount: c.amount } } });
    return c.id;
  });
  return { ok: true, value: { id, created: true } };
}

/** Anula un cargo sin pagos. Uno con pagos se resuelve con una devolución, no anulándolo. */
export async function cancelCharge(db: PrismaClient, actorPersonId: string, chargeId: string, reason: string): Promise<Result<{ id: string }>> {
  const c = await db.charge.findUnique({ where: { id: chargeId } });
  if (!c) return fail('not_found', 'Cargo inexistente');
  if (c.status !== 'pending') return fail('conflict', 'Solo se anulan cargos pendientes');
  if (c.paidAmount > 0) return fail('conflict', 'Tiene pagos imputados: corresponde una devolución');
  if (reason.trim().length < 3) return fail('invalid_input', 'Indicá el motivo');
  await db.$transaction(async (tx) => {
    await tx.charge.update({ where: { id: c.id }, data: { status: 'cancelled', cancelledReason: reason.trim() } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'charge.cancelled', entityType: 'person', entityId: c.personId, diff: { description: c.description, reason: reason.trim() } } });
  });
  return { ok: true, value: { id: c.id } };
}

/**
 * Cuotas sociales del período para cada membresía vigente cuya categoría tiene cuota. Idempotente:
 * volver a correrla no duplica (referencia `cuota:<membresía>:<período>`).
 */
export async function issueMonthlyDues(db: PrismaClient, actorPersonId: string | null, period: string, dueDay = 10): Promise<Result<{ issued: number; skipped: number }>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail('invalid_input', 'Período inválido (AAAA-MM)');
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return fail('invalid_input', 'Día de vencimiento entre 1 y 28');
  const [y, m] = period.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const memberships = await db.clubMembership.findMany({
    where: { status: 'active', validFrom: { lte: end }, OR: [{ validTo: null }, { validTo: { gte: start } }], category: { monthlyFee: { not: null } } },
    select: { id: true, personId: true, category: { select: { name: true, monthlyFee: true } } },
  });
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start);
  const rows = memberships.map((ms) => ({
    personId: ms.personId,
    concept: 'cuota_social',
    groupLabel: 'Membresía social',
    description: `Cuota social ${label} · ${ms.category.name}`,
    period,
    amount: ms.category.monthlyFee!,
    dueDate: new Date(Date.UTC(y, m - 1, dueDay)),
    source: 'finance',
    sourceRef: `cuota:${ms.id}:${period}`,
    issuedById: actorPersonId,
  }));
  const created = await db.$transaction(async (tx) => {
    const r = await tx.charge.createMany({ data: rows, skipDuplicates: true });
    if (r.count) await appendOutbox(tx, createEvent('charge.dues_issued', 'finance', { period, count: r.count }));
    if (actorPersonId && r.count)
      await tx.auditLog.create({ data: { actorPersonId, action: 'charge.dues_issued', entityType: 'finance', entityId: period, diff: { count: r.count } } });
    return r.count;
  });
  return { ok: true, value: { issued: created, skipped: rows.length - created } };
}

/** Bloquea los cargos y devuelve los pendientes en orden de vencimiento. */
async function lockPending(tx: Tx, chargeIds: string[]) {
  if (!chargeIds.length) return [];
  await tx.$queryRaw`SELECT id FROM "Charge" WHERE id = ANY(${chargeIds}::text[]) FOR UPDATE`;
  return tx.charge.findMany({ where: { id: { in: chargeIds }, status: 'pending' }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] });
}

/** Imputa `amount` a los cargos en orden; devuelve lo que no se pudo imputar. */
async function allocate(tx: Tx, paymentId: string, charges: Awaited<ReturnType<typeof lockPending>>, amount: number): Promise<number> {
  let left = amount;
  for (const c of charges) {
    if (left <= 0) break;
    const take = Math.min(left, c.amount - c.paidAmount);
    if (take <= 0) continue;
    await tx.paymentAllocation.create({ data: { paymentId, chargeId: c.id, amount: take } });
    const paid = c.paidAmount + take;
    await tx.charge.update({ where: { id: c.id }, data: { paidAmount: paid, status: paid === c.amount ? 'paid' : 'pending' } });
    left -= take;
  }
  return left;
}

export interface RecordPaymentInput {
  payerPersonId: string | null;
  chargeIds: string[];
  method: 'cash' | 'transfer' | 'card';
  /** Por defecto, el total pendiente de los cargos elegidos. Menos: pago parcial (se imputa por vencimiento). */
  amount?: number;
  note?: string | null;
}

/** Cobro presencial (caja, transferencia, posnet): nace aprobado y se imputa en el acto. */
export async function recordPayment(db: PrismaClient, actorPersonId: string, input: RecordPaymentInput): Promise<Result<{ id: string; number: number; amount: number }>> {
  const ids = [...new Set(input.chargeIds)];
  if (!ids.length) return fail('invalid_input', 'Elegí al menos un cargo');
  try {
    const r = await db.$transaction(async (tx) => {
      const charges = await lockPending(tx, ids);
      if (charges.length !== ids.length) throw new DomainError('conflict', 'Algún cargo ya no está pendiente: actualizá la cuenta');
      const outstanding = charges.reduce((s, c) => s + c.amount - c.paidAmount, 0);
      const amount = input.amount ?? outstanding;
      if (!validAmount(amount)) throw new DomainError('invalid_input', 'El monto tiene que ser mayor a cero');
      if (amount > outstanding) throw new DomainError('invalid_input', 'El monto supera lo pendiente de los cargos elegidos', { outstanding });
      const p = await tx.payment.create({
        data: { payerPersonId: input.payerPersonId, amount, method: input.method, status: 'approved', intent: ids, note: input.note?.trim() || null, recordedById: actorPersonId, receivedAt: new Date() },
      });
      await allocate(tx, p.id, charges, amount);
      await tx.paymentEvent.create({ data: { paymentId: p.id, kind: 'recorded', detail: { method: input.method } } });
      await appendOutbox(tx, createEvent('payment.approved', 'finance', { paymentId: p.id, payerPersonId: input.payerPersonId, amount, chargeIds: ids }));
      const owners = [...new Set(charges.map((c) => c.personId))];
      for (const personId of owners)
        await tx.auditLog.create({ data: { actorPersonId, action: 'payment.recorded', entityType: 'person', entityId: personId, diff: { number: p.number, amount, method: input.method } } });
      return { id: p.id, number: p.number, amount };
    });
    return { ok: true, value: r };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
}

/** Pago online: crea el pago pendiente con los cargos que quiere cancelar. Se imputa al aprobarse. */
export async function startOnlinePayment(db: PrismaClient, input: { payerPersonId: string; chargeIds: string[]; provider: string }): Promise<Result<{ id: string; amount: number; charges: Array<{ id: string; description: string; amount: number }> }>> {
  const ids = [...new Set(input.chargeIds)];
  if (!ids.length) return fail('invalid_input', 'Elegí al menos un cargo');
  const charges = await db.charge.findMany({ where: { id: { in: ids }, status: 'pending' } });
  if (charges.length !== ids.length) return fail('conflict', 'Algún cargo ya no está pendiente: actualizá la cuenta');
  const items = charges.map((c) => ({ id: c.id, description: c.description, amount: c.amount - c.paidAmount }));
  const amount = items.reduce((s, c) => s + c.amount, 0);
  const p = await db.payment.create({ data: { payerPersonId: input.payerPersonId, amount, method: 'mercadopago', provider: input.provider, status: 'pending', intent: ids } });
  await db.paymentEvent.create({ data: { paymentId: p.id, kind: 'checkout_created', detail: { amount } } });
  return { ok: true, value: { id: p.id, amount, charges: items } };
}

export type GatewayStatus = 'approved' | 'pending' | 'in_process' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back';

export interface GatewayUpdate {
  /** Nuestro id de pago (external_reference en la pasarela). */
  paymentId: string;
  providerRef: string;
  status: GatewayStatus;
  amount: number;
}

/**
 * Aplica lo que informa la pasarela. Idempotente: el mismo `approved` dos veces se anota como
 * duplicado y no imputa de nuevo. Un monto distinto al esperado no se aprueba.
 */
export async function applyGatewayUpdate(db: PrismaClient, update: GatewayUpdate): Promise<Result<{ changed: boolean; status: string }>> {
  try {
    const r = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${update.paymentId} FOR UPDATE`;
      const p = await tx.payment.findUnique({ where: { id: update.paymentId } });
      if (!p || p.method !== 'mercadopago') throw new DomainError('not_found', 'Pago inexistente');
      const log = (kind: string, detail: Record<string, unknown> = {}) => tx.paymentEvent.create({ data: { paymentId: p.id, kind, detail: { providerRef: update.providerRef, status: update.status, ...detail } } });
      if (p.providerRef && p.providerRef !== update.providerRef && p.status === 'approved') {
        await log('webhook_other_operation');
        return { changed: false, status: p.status };
      }
      if (update.status === 'approved') {
        if (p.status === 'approved') {
          await log('webhook_duplicate');
          return { changed: false, status: p.status };
        }
        if (p.status !== 'pending') {
          await log('webhook_ignored', { current: p.status });
          return { changed: false, status: p.status };
        }
        if (update.amount !== p.amount) {
          await log('amount_mismatch', { expected: p.amount, received: update.amount });
          return { changed: false, status: p.status };
        }
        const charges = await lockPending(tx, p.intent);
        await tx.payment.update({ where: { id: p.id }, data: { status: 'approved', providerRef: update.providerRef, receivedAt: new Date() } });
        const left = await allocate(tx, p.id, charges, p.amount);
        await log('approved');
        if (left > 0) await log('unallocated_remainder', { amount: left });
        await appendOutbox(tx, createEvent('payment.approved', 'finance', { paymentId: p.id, payerPersonId: p.payerPersonId, amount: p.amount, chargeIds: p.intent }));
        return { changed: true, status: 'approved' };
      }
      if (update.status === 'pending' || update.status === 'in_process') {
        if (p.status !== 'pending' || p.providerRef === update.providerRef) {
          await log('webhook_duplicate');
          return { changed: false, status: p.status };
        }
        await tx.payment.update({ where: { id: p.id }, data: { providerRef: update.providerRef } });
        await log('webhook_pending');
        return { changed: true, status: 'pending' };
      }
      if (update.status === 'rejected' || update.status === 'cancelled') {
        if (p.status !== 'pending') {
          await log('webhook_ignored', { current: p.status });
          return { changed: false, status: p.status };
        }
        await tx.payment.update({ where: { id: p.id }, data: { status: 'rejected', providerRef: update.providerRef } });
        await log('rejected');
        return { changed: true, status: 'rejected' };
      }
      // Devoluciones y contracargos de pagos aprobados: se anotan y quedan para revisión manual (Hito A).
      await log('needs_review');
      return { changed: false, status: p.status };
    });
    return { ok: true, value: r };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
}
