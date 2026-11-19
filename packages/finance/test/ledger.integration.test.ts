import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { accountFor, applyGatewayUpdate, cancelCharge, financeSummary, issueCharge, issueMonthlyDues, receipt, recordPayment, startOnlinePayment } from '../src';

const url = testDatabaseUrl('finance');
const db = url ? createPrismaClient(url) : null;
const AT = new Date('2026-11-19T15:00:00Z');

describe.skipIf(!db)('Finanzas sobre PostgreSQL', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};

  const charge = (personId: string, ref: string, amount: number, due = '2026-11-20', group = 'Rugby XV') =>
    issueCharge(prisma, ids.admin!, { personId, concept: 'arancel', groupLabel: group, description: `Arancel ${ref}`, amount, dueDate: new Date(due), source: 'test', sourceRef: ref });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Person","Charge","Payment","PaymentAllocation","PaymentEvent","ClubMembership","MembershipCategory","FamilyGroup","FamilyRelationship","AuditLog","OutboxEvent" CASCADE',
    );
    const activo = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo pleno', monthlyFee: 22_000_00 } });
    const vitalicio = await prisma.membershipCategory.create({ data: { code: 'vitalicio', name: 'Vitalicio' } });
    ids.admin = (await prisma.person.create({ data: { firstName: 'Sofía', lastName: 'Ruiz' } })).id;
    ids.martina = (await prisma.person.create({ data: { firstName: 'Martina', lastName: 'Gómez', memberships: { create: { categoryId: activo.id, memberNumber: '4127', validFrom: new Date('2014-03-01') } } } })).id;
    ids.sofia = (await prisma.person.create({ data: { firstName: 'Sofía', lastName: 'Gómez', memberships: { create: { categoryId: activo.id, memberNumber: '4130', validFrom: new Date('2024-01-01') } } } })).id;
    ids.ramiro = (await prisma.person.create({ data: { firstName: 'Ramiro', lastName: 'Ortiz', memberships: { create: { categoryId: vitalicio.id, memberNumber: '2210', validFrom: new Date('1990-01-01') } } } })).id;
    await prisma.familyGroup.create({ data: { name: 'Familia Gómez', members: { create: [{ personId: ids.martina, role: 'guardian' }, { personId: ids.sofia, role: 'dependent' }] } } });
  });

  it('emite cargos sin duplicar y valida montos', async () => {
    const a = await charge(ids.martina!, 'nov', 18_500_00);
    const b = await charge(ids.martina!, 'nov', 18_500_00);
    expect(a).toMatchObject({ ok: true, value: { created: true } });
    expect(b).toMatchObject({ ok: true, value: { created: false } });
    expect(await charge(ids.martina!, 'x', 0)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await charge(ids.martina!, 'y', 12.5)).toMatchObject({ ok: false });
    expect(await prisma.outboxEvent.count({ where: { type: 'charge.issued' } })).toBe(1);
  });

  it('cuotas sociales del mes: solo categorías con cuota, idempotente', async () => {
    expect(await issueMonthlyDues(prisma, ids.admin!, '2026-11')).toMatchObject({ ok: true, value: { issued: 2, skipped: 0 } });
    expect(await issueMonthlyDues(prisma, ids.admin!, '2026-11')).toMatchObject({ ok: true, value: { issued: 0, skipped: 2 } });
    const c = await prisma.charge.findFirstOrThrow({ where: { personId: ids.martina! } });
    expect(c).toMatchObject({ concept: 'cuota_social', amount: 22_000_00, period: '2026-11', description: 'Cuota social noviembre de 2026 · Activo pleno' });
    expect(await prisma.charge.count({ where: { personId: ids.ramiro! } })).toBe(0);
    expect(await issueMonthlyDues(prisma, null, '2026-13')).toMatchObject({ ok: false });
  });

  it('cobro en caja: imputa por vencimiento, parcial y total, con comprobante', async () => {
    const old = (await charge(ids.martina!, 'oct', 10_000_00, '2026-10-20')) as { value: { id: string } };
    const nov = (await charge(ids.martina!, 'nov', 18_500_00)) as { value: { id: string } };
    // Parcial: 15.000 → cubre octubre (10.000) y 5.000 de noviembre.
    const p1 = await recordPayment(prisma, ids.admin!, { payerPersonId: ids.martina!, chargeIds: [nov.value.id, old.value.id], method: 'cash', amount: 15_000_00 });
    expect(p1.ok).toBe(true);
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: old.value.id } })).toMatchObject({ status: 'paid', paidAmount: 10_000_00 });
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: nov.value.id } })).toMatchObject({ status: 'pending', paidAmount: 5_000_00 });
    // No se puede cobrar de más.
    expect(await recordPayment(prisma, ids.admin!, { payerPersonId: ids.martina!, chargeIds: [nov.value.id], method: 'cash', amount: 14_000_00 })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    // Lo que falta: se toma el pendiente.
    const p2 = await recordPayment(prisma, ids.admin!, { payerPersonId: ids.martina!, chargeIds: [nov.value.id], method: 'transfer' });
    expect(p2).toMatchObject({ ok: true, value: { amount: 13_500_00 } });
    // Un cargo ya pagado no se vuelve a cobrar.
    expect(await recordPayment(prisma, ids.admin!, { payerPersonId: ids.martina!, chargeIds: [nov.value.id], method: 'cash' })).toMatchObject({ ok: false, error: { code: 'conflict' } });

    const r = await receipt(prisma, p1.ok ? p1.value.id : '');
    expect(r).toMatchObject({ amount: 15_000_00, payer: { name: 'Martina Gómez' }, lines: [{ description: 'Arancel oct', amount: 10_000_00 }, { description: 'Arancel nov', amount: 5_000_00 }] });
    expect(await prisma.outboxEvent.count({ where: { type: 'payment.approved' } })).toBe(2);
  });

  it('cuenta unificada: la responsable ve lo suyo y lo de su hija; la hija, solo lo suyo', async () => {
    await charge(ids.martina!, 'm1', 18_500_00, '2026-11-01');
    await charge(ids.sofia!, 'colonia', 40_000_00, '2026-12-15', 'Colonia');
    const a = await accountFor(prisma, ids.martina!, AT);
    expect(a.people.map((p) => [p.firstName, p.pending])).toEqual([
      ['Martina', 18_500_00],
      ['Sofía', 40_000_00],
    ]);
    expect(a).toMatchObject({ totalPending: 58_500_00, overdue: 18_500_00 });
    expect(a.people[0]!.groups[0]!.charges[0]).toMatchObject({ overdue: true, outstanding: 18_500_00 });
    const s = await accountFor(prisma, ids.sofia!, AT);
    expect(s.people.map((p) => p.firstName)).toEqual(['Sofía']);
  });

  it('pasarela: imputa solo con approved y por el monto exacto; duplicados no cambian nada', async () => {
    const c = (await charge(ids.martina!, 'nov', 18_500_00)) as { value: { id: string } };
    const start = await startOnlinePayment(prisma, { payerPersonId: ids.martina!, chargeIds: [c.value.id], provider: 'mercadopago' });
    expect(start).toMatchObject({ ok: true, value: { amount: 18_500_00 } });
    const paymentId = start.ok ? start.value.id : '';
    expect((await accountFor(prisma, ids.martina!, AT)).people[0]!.groups[0]!.charges[0]!.verifying).toBe(true);

    expect(await applyGatewayUpdate(prisma, { paymentId, providerRef: '88340', status: 'pending', amount: 18_500_00 })).toMatchObject({ ok: true, value: { changed: true } });
    expect(await applyGatewayUpdate(prisma, { paymentId, providerRef: '88340', status: 'approved', amount: 1_00 })).toMatchObject({ ok: true, value: { changed: false } });
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: c.value.id } })).toMatchObject({ status: 'pending' });
    expect(await applyGatewayUpdate(prisma, { paymentId, providerRef: '88340', status: 'approved', amount: 18_500_00 })).toMatchObject({ ok: true, value: { changed: true, status: 'approved' } });
    expect(await applyGatewayUpdate(prisma, { paymentId, providerRef: '88340', status: 'approved', amount: 18_500_00 })).toMatchObject({ ok: true, value: { changed: false } });
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: c.value.id } })).toMatchObject({ status: 'paid', paidAmount: 18_500_00 });
    expect(await prisma.paymentAllocation.count()).toBe(1);
    const log = (await prisma.paymentEvent.findMany({ where: { paymentId }, orderBy: { at: 'asc' } })).map((e) => e.kind);
    expect(log).toEqual(['checkout_created', 'webhook_pending', 'amount_mismatch', 'approved', 'webhook_duplicate']);
    expect(await applyGatewayUpdate(prisma, { paymentId: 'nope', providerRef: '1', status: 'approved', amount: 1 })).toMatchObject({ ok: false, error: { code: 'not_found' } });
  });

  it('si el cargo se pagó en caja mientras tanto, el pago online queda con remanente para devolver', async () => {
    const c = (await charge(ids.martina!, 'nov', 18_500_00)) as { value: { id: string } };
    const start = await startOnlinePayment(prisma, { payerPersonId: ids.martina!, chargeIds: [c.value.id], provider: 'mercadopago' });
    await recordPayment(prisma, ids.admin!, { payerPersonId: ids.martina!, chargeIds: [c.value.id], method: 'cash' });
    const paymentId = start.ok ? start.value.id : '';
    await applyGatewayUpdate(prisma, { paymentId, providerRef: '1', status: 'approved', amount: 18_500_00 });
    expect(await prisma.paymentEvent.findFirst({ where: { paymentId, kind: 'unallocated_remainder' } })).toMatchObject({ detail: { amount: 18_500_00 } });
    expect(await prisma.charge.findUniqueOrThrow({ where: { id: c.value.id } })).toMatchObject({ paidAmount: 18_500_00 });
  });

  it('anular: solo cargos sin pagos', async () => {
    const c = (await charge(ids.martina!, 'nov', 18_500_00)) as { value: { id: string } };
    const d = (await charge(ids.martina!, 'dic', 18_500_00)) as { value: { id: string } };
    await recordPayment(prisma, ids.admin!, { payerPersonId: null, chargeIds: [d.value.id], method: 'cash', amount: 1_000_00 });
    expect(await cancelCharge(prisma, ids.admin!, d.value.id, 'Error de carga')).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await cancelCharge(prisma, ids.admin!, c.value.id, 'Error de carga')).toMatchObject({ ok: true });
    expect((await accountFor(prisma, ids.martina!, AT)).totalPending).toBe(17_500_00);
  });

  it('resumen: emitido, cobrado, pendiente y socios morosos (+21 días)', async () => {
    await issueCharge(prisma, null, { personId: ids.martina!, concept: 'cuota_social', groupLabel: 'Membresía social', description: 'Cuota octubre', amount: 22_000_00, dueDate: new Date('2026-10-10'), source: 'test', sourceRef: 'oct' });
    const n = (await charge(ids.sofia!, 'n', 10_000_00)) as { value: { id: string } };
    await recordPayment(prisma, ids.admin!, { payerPersonId: ids.martina!, chargeIds: [n.value.id], method: 'cash' });
    const s = await financeSummary(prisma, new Date());
    expect(s).toMatchObject({ issuedThisMonth: 32_000_00, collectedThisMonth: 10_000_00, pendingTotal: 22_000_00, lateMembers: 1, activeMembers: 3, byMethod: [{ method: 'cash', amount: 10_000_00 }] });
  });
});
