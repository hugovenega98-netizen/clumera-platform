import { accountFor, formatMoney, periodLabel } from '@clumera/finance';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AccountLedger, IssueChargeForm, type LedgerRow } from '@/components/FinanceForms';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { canViewAccount } from '@/lib/finance-access';
import { dateFmt, initials } from '@/lib/people-format';

export const metadata: Metadata = { title: 'Cuenta' };
export const dynamic = 'force-dynamic';

/** Cuenta de una persona por concepto: cobrar en caja, emitir y anular cargos, comprobantes. */
export default async function AccountPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const { session, can } = await requireAdmin(`/admin/finanzas/cuentas/${personId}`, 'finance:payment.record');
  if (!(await canViewAccount(session.personId, personId))) forbidden();
  const db = getPrisma();
  const person = await db.person.findUnique({
    where: { id: personId },
    select: { firstName: true, lastName: true, memberships: { orderBy: { validFrom: 'desc' }, take: 1, select: { memberNumber: true, category: { select: { name: true } } } } },
  });
  if (!person) notFound();
  const account = await accountFor(db, personId, new Date(), [personId]);
  const me = account.people[0];
  const receiptIds = new Map((await db.payment.findMany({ where: { allocations: { some: { charge: { personId } } }, status: 'approved' }, select: { id: true, number: true } })).map((p) => [`R-${String(p.number).padStart(6, '0')}`, p.id]));
  const rows: LedgerRow[] = (me?.groups ?? []).flatMap((g) =>
    g.charges.map((c) => ({
      id: c.id,
      group: g.label,
      description: c.description,
      when: c.period ? `${periodLabel(c.period)} · vence ${dateFmt.format(c.dueDate)}` : `Vence ${dateFmt.format(c.dueDate)}`,
      amount: c.amount,
      paid: c.paidAmount,
      outstanding: c.outstanding,
      status: c.status,
      overdue: c.overdue,
      verifying: c.verifying,
      receipts: c.receipts.map((label) => ({ id: receiptIds.get(label) ?? '', label })).filter((x) => x.id),
    })),
  );
  const m = person.memberships[0];
  const paidYear = account.payments.filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount, 0);

  return (
    <AppShell session={session} current="/admin/finanzas" title="Cuenta" space="admin">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/admin/finanzas">
          ← Buscador central
        </Link>
      </nav>
      <header className="profile-head">
        <span className="profile-head__avatar" aria-hidden="true">
          {initials(person.firstName, person.lastName)}
        </span>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1>
            {person.firstName} {person.lastName}
          </h1>
          <div className="cx-muted">{m ? `N° ${m.memberNumber ?? '—'} · ${m.category.name}` : 'No socio'}</div>
        </div>
        {can('identity:person.view') ? (
          <Link className="cx-btn cx-btn--secondary" href={`/admin/personas/${personId}`}>
            Ver ficha
          </Link>
        ) : null}
      </header>
      <section className="kpis" aria-label="Resumen de la cuenta">
        <div className="kpi">
          <span className="cx-muted">Pendiente</span>
          <b style={{ color: account.totalPending ? 'var(--cx-warn)' : 'var(--cx-ok)' }}>{account.totalPending ? formatMoney(account.totalPending) : 'Al día'}</b>
          <span className="cx-muted">{account.overdue ? `${formatMoney(account.overdue)} vencido` : 'nada vencido'}</span>
        </div>
        <div className="kpi">
          <span className="cx-muted">Cobrado últimos 12 meses</span>
          <b>{formatMoney(paidYear)}</b>
          <span className="cx-muted">{account.payments.filter((p) => p.status === 'approved').length} comprobantes</span>
        </div>
      </section>
      <Card title="Cuenta por concepto">
        <AccountLedger personId={personId} rows={rows} canRecord={can('finance:payment.record')} canIssue={can('finance:charge.issue')} />
      </Card>
      {can('finance:charge.issue') ? (
        <Card title="Emitir cargo">
          <IssueChargeForm personId={personId} />
        </Card>
      ) : null}
    </AppShell>
  );
}
