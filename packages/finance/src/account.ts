/**
 * Lecturas de Finanzas: la cuenta unificada (una persona y sus representados), el comprobante y el
 * resumen institucional. Solo montos y conceptos: nada de datos de salud.
 */
import type { PrismaClient } from '@clumera/db';

export interface AccountCharge {
  id: string;
  description: string;
  concept: string;
  period: string | null;
  amount: number;
  paidAmount: number;
  outstanding: number;
  dueDate: Date;
  status: 'pending' | 'paid' | 'cancelled';
  overdue: boolean;
  /** Pago online en curso que incluye este cargo. */
  verifying: boolean;
  receipts: string[];
}

export interface AccountPerson {
  personId: string;
  firstName: string;
  lastName: string;
  isSelf: boolean;
  pending: number;
  groups: Array<{ label: string; charges: AccountCharge[]; pending: number }>;
}

export interface AccountPayment {
  id: string;
  number: number;
  amount: number;
  method: 'cash' | 'transfer' | 'card' | 'mercadopago';
  status: 'pending' | 'approved' | 'rejected' | 'refunded';
  at: Date;
  concepts: string[];
}

export interface Account {
  people: AccountPerson[];
  totalPending: number;
  overdue: number;
  payments: AccountPayment[];
}

const HISTORY_DAYS = 365;

/** Personas cuya cuenta ve alguien: ella misma y sus representados (si es responsable). */
export async function accountHolders(db: PrismaClient, personId: string): Promise<string[]> {
  const rows = await db.familyRelationship.findMany({
    where: { role: 'dependent', group: { members: { some: { personId, role: 'guardian' } } } },
    select: { personId: true },
  });
  return [personId, ...new Set(rows.map((r) => r.personId).filter((id) => id !== personId))];
}

/**
 * Cuenta unificada. `holders` son las personas incluidas (por defecto, la persona y sus
 * representados); la administración puede pedir una sola persona.
 */
export async function accountFor(db: PrismaClient, personId: string, at = new Date(), holders?: string[]): Promise<Account> {
  const ids = holders ?? (await accountHolders(db, personId));
  const since = new Date(at.getTime() - HISTORY_DAYS * 86_400_000);
  const [people, charges, payments] = await Promise.all([
    db.person.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }),
    db.charge.findMany({
      where: { personId: { in: ids }, OR: [{ status: 'pending' }, { status: 'paid', createdAt: { gte: since } }] },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      include: { allocations: { where: { payment: { status: 'approved' } }, select: { payment: { select: { number: true } } } } },
    }),
    db.payment.findMany({
      where: { createdAt: { gte: since }, status: { in: ['approved', 'pending', 'refunded'] }, OR: [{ payerPersonId: { in: ids } }, { allocations: { some: { charge: { personId: { in: ids } } } } }] },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { allocations: { select: { charge: { select: { description: true } } } } },
    }),
  ]);
  const pendingIds = charges.filter((c) => c.status === 'pending').map((c) => c.id);
  const pendingOnline = pendingIds.length
    ? await db.payment.findMany({ where: { status: 'pending', method: 'mercadopago', intent: { hasSome: pendingIds } }, select: { intent: true } })
    : [];
  const verifying = new Set(pendingOnline.flatMap((p) => p.intent));
  const byPerson = new Map(people.map((p) => [p.id, p]));
  const result: AccountPerson[] = ids
    .filter((id) => byPerson.has(id))
    .map((id) => {
      const p = byPerson.get(id)!;
      const groups = new Map<string, AccountCharge[]>();
      for (const c of charges.filter((x) => x.personId === id)) {
        const item: AccountCharge = {
          id: c.id,
          description: c.description,
          concept: c.concept,
          period: c.period,
          amount: c.amount,
          paidAmount: c.paidAmount,
          outstanding: c.status === 'pending' ? c.amount - c.paidAmount : 0,
          dueDate: c.dueDate,
          status: c.status,
          overdue: c.status === 'pending' && c.dueDate < at,
          verifying: c.status === 'pending' && verifying.has(c.id),
          receipts: [...new Set(c.allocations.map((a) => a.payment.number))].map((n) => `R-${String(n).padStart(6, '0')}`),
        };
        groups.set(c.groupLabel, [...(groups.get(c.groupLabel) ?? []), item]);
      }
      const list = [...groups].map(([label, items]) => ({ label, charges: items, pending: items.reduce((s, c) => s + c.outstanding, 0) }));
      list.sort((a, b) => b.pending - a.pending || a.label.localeCompare(b.label));
      return { personId: id, firstName: p.firstName, lastName: p.lastName, isSelf: id === personId, groups: list, pending: list.reduce((s, g) => s + g.pending, 0) };
    });
  const pendingCharges = charges.filter((c) => c.status === 'pending');
  return {
    people: result,
    totalPending: pendingCharges.reduce((s, c) => s + c.amount - c.paidAmount, 0),
    overdue: pendingCharges.filter((c) => c.dueDate < at).reduce((s, c) => s + c.amount - c.paidAmount, 0),
    payments: payments.map((p) => ({ id: p.id, number: p.number, amount: p.amount, method: p.method, status: p.status, at: p.receivedAt ?? p.createdAt, concepts: p.allocations.map((a) => a.charge.description) })),
  };
}

/** Pendiente por persona (para listas y buscadores). */
export async function pendingByPerson(db: PrismaClient, personIds: string[]): Promise<Map<string, number>> {
  if (!personIds.length) return new Map();
  const rows = await db.charge.groupBy({ by: ['personId'], where: { personId: { in: personIds }, status: 'pending' }, _sum: { amount: true, paidAmount: true } });
  return new Map(rows.map((r) => [r.personId, (r._sum.amount ?? 0) - (r._sum.paidAmount ?? 0)]));
}

export interface Receipt {
  id: string;
  number: number;
  amount: number;
  method: string;
  status: string;
  at: Date;
  payer: { id: string; name: string } | null;
  lines: Array<{ description: string; person: string; personId: string; amount: number }>;
  /** Personas a las que corresponden los cargos (para decidir quién puede verlo). */
  ownerIds: string[];
}

export async function receipt(db: PrismaClient, paymentId: string): Promise<Receipt | null> {
  const p = await db.payment.findUnique({
    where: { id: paymentId },
    include: {
      payer: { select: { id: true, firstName: true, lastName: true } },
      allocations: { include: { charge: { select: { description: true, personId: true, person: { select: { firstName: true, lastName: true } } } } } },
    },
  });
  if (!p) return null;
  return {
    id: p.id,
    number: p.number,
    amount: p.amount,
    method: p.method,
    status: p.status,
    at: p.receivedAt ?? p.createdAt,
    payer: p.payer ? { id: p.payer.id, name: `${p.payer.firstName} ${p.payer.lastName}` } : null,
    lines: p.allocations.map((a) => ({ description: a.charge.description, person: `${a.charge.person.firstName} ${a.charge.person.lastName}`, personId: a.charge.personId, amount: a.amount })),
    ownerIds: [...new Set([...(p.payerPersonId ? [p.payerPersonId] : []), ...p.allocations.map((a) => a.charge.personId)])],
  };
}

export interface FinanceSummary {
  issuedThisMonth: number;
  collectedThisMonth: number;
  pendingTotal: number;
  overdueTotal: number;
  /** Socios activos con cuota social vencida hace más de 21 días. */
  lateMembers: number;
  activeMembers: number;
  onlineInVerification: number;
  byMethod: Array<{ method: string; amount: number }>;
}

export async function financeSummary(db: PrismaClient, at = new Date()): Promise<FinanceSummary> {
  const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const lateLimit = new Date(at.getTime() - 21 * 86_400_000);
  const [issued, collected, pending, overdue, late, activeMembers, verifying, methods] = await Promise.all([
    db.charge.aggregate({ where: { createdAt: { gte: monthStart, lte: at }, status: { not: 'cancelled' } }, _sum: { amount: true } }),
    db.payment.aggregate({ where: { status: 'approved', receivedAt: { gte: monthStart, lte: at } }, _sum: { amount: true } }),
    db.charge.aggregate({ where: { status: 'pending' }, _sum: { amount: true, paidAmount: true } }),
    db.charge.aggregate({ where: { status: 'pending', dueDate: { lt: at } }, _sum: { amount: true, paidAmount: true } }),
    db.charge.findMany({ where: { status: 'pending', concept: 'cuota_social', dueDate: { lt: lateLimit } }, distinct: ['personId'], select: { personId: true } }),
    db.clubMembership.count({ where: { status: 'active' } }),
    db.payment.count({ where: { status: 'pending', method: 'mercadopago' } }),
    db.payment.groupBy({ by: ['method'], where: { status: 'approved', receivedAt: { gte: monthStart, lte: at } }, _sum: { amount: true } }),
  ]);
  return {
    issuedThisMonth: issued._sum.amount ?? 0,
    collectedThisMonth: collected._sum.amount ?? 0,
    pendingTotal: (pending._sum.amount ?? 0) - (pending._sum.paidAmount ?? 0),
    overdueTotal: (overdue._sum.amount ?? 0) - (overdue._sum.paidAmount ?? 0),
    lateMembers: late.length,
    activeMembers,
    onlineInVerification: verifying,
    byMethod: methods.map((m) => ({ method: m.method, amount: m._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount),
  };
}

/** Pagos online pendientes o con eventos para revisar (conciliación). */
export async function paymentsToReview(db: PrismaClient, take = 20) {
  return db.payment.findMany({
    where: { method: 'mercadopago', OR: [{ status: 'pending' }, { events: { some: { kind: { in: ['amount_mismatch', 'unallocated_remainder', 'needs_review'] } } } }] },
    orderBy: { createdAt: 'desc' },
    take,
    include: { payer: { select: { firstName: true, lastName: true } }, events: { orderBy: { at: 'asc' } } },
  });
}
