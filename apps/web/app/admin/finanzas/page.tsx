import { financeSummary, formatMoney, paymentsToReview, pendingByPerson, periodOf } from '@clumera/finance';
import { searchPeople } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { IssueDuesForm } from '@/components/FinanceForms';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { docPepper } from '@/lib/people-api';
import { dateTimeFmt, num } from '@/lib/people-format';

export const metadata: Metadata = { title: 'Finanzas' };
export const dynamic = 'force-dynamic';

const METHOD: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Posnet', mercadopago: 'Mercado Pago' };
const EVENT: Record<string, string> = {
  checkout_created: 'Pago iniciado',
  preference_created: 'Enviado a Mercado Pago',
  preference_failed: 'No se pudo abrir Mercado Pago',
  webhook_pending: 'Webhook pending recibido',
  webhook_duplicate: 'Webhook duplicado ignorado',
  amount_mismatch: 'Monto distinto al esperado: no se aprueba',
  approved: 'Aprobado e imputado',
  unallocated_remainder: 'Quedó un remanente para devolver',
  rejected: 'Rechazado',
  needs_review: 'Requiere revisión (devolución o contracargo)',
  webhook_ignored: 'Webhook ignorado',
};

/**
 * Buscador central de Finanzas: buscar la cuenta de una persona y cobrar. Con permiso de reportes,
 * además los números del mes, la morosidad y la conciliación de Mercado Pago.
 */
export default async function FinanceHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { session, can } = await requireAdmin('/admin/finanzas', 'finance:payment.record');
  const q = ((await searchParams).q ?? '').slice(0, 100);
  const db = getPrisma();
  const reports = can('finance:report.view');
  const [summary, review, found] = await Promise.all([
    reports ? financeSummary(db) : null,
    reports ? paymentsToReview(db) : [],
    q ? searchPeople(db, { q, pepper: docPepper() }) : null,
  ]);
  const pending = found ? await pendingByPerson(db, found.items.map((p) => p.id)) : new Map<string, number>();

  return (
    <AppShell session={session} current="/admin/finanzas" title="Finanzas" space="admin">
      <div className="adm-bar">
        <h1>Buscador central</h1>
        <form action="/admin/finanzas" className="search-row" role="search" style={{ flex: '1 1 320px', maxWidth: 520 }}>
          <input className="cx-input" type="search" name="q" defaultValue={q} aria-label="Buscar cuenta" placeholder="Nombre, DNI o N° de socio…" />
          <button className="cx-btn cx-btn--secondary" type="submit">
            Buscar
          </button>
        </form>
      </div>
      {found ? (
        <Card title={`Cuentas · «${q}»`}>
          {found.items.length === 0 ? <p role="status">No hay personas que coincidan.</p> : null}
          <div className="rows">
            {found.items.map((p) => {
              const owed = pending.get(p.id) ?? 0;
              return (
                <div key={p.id}>
                  <span className="grow">
                    <Link className="cx-link" href={`/admin/finanzas/cuentas/${p.id}`}>
                      {p.lastName}, {p.firstName}
                    </Link>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {p.memberNumber ? `N° ${p.memberNumber}` : 'No socio'}
                      {p.category ? ` · ${p.category}` : ''}
                    </span>
                  </span>
                  {owed ? <span className="cx-tag cx-tag--warn">Debe {formatMoney(owed)}</span> : <span className="cx-tag cx-tag--ok">Al día</span>}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
      {summary ? (
        <>
          <section className="kpis" aria-label="Finanzas del mes">
            <div className="kpi">
              <span className="cx-muted">Cobrado este mes</span>
              <b>{formatMoney(summary.collectedThisMonth)}</b>
              <span className="cx-muted">de {formatMoney(summary.issuedThisMonth)} emitidos</span>
            </div>
            <div className="kpi">
              <span className="cx-muted">Pendiente total</span>
              <b>{formatMoney(summary.pendingTotal)}</b>
              <span className="cx-muted">{formatMoney(summary.overdueTotal)} vencido</span>
            </div>
            <div className="kpi">
              <span className="cx-muted">Morosidad (+21 días)</span>
              <b>{summary.activeMembers ? `${((summary.lateMembers / summary.activeMembers) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%` : '—'}</b>
              <span className="cx-muted">
                {summary.lateMembers === 1 ? '1 socio' : `${num.format(summary.lateMembers)} socios`} · cuota social
              </span>
            </div>
            <div className="kpi">
              <span className="cx-muted">Pagos online en verificación</span>
              <b>{num.format(summary.onlineInVerification)}</b>
              <span className="cx-muted">Mercado Pago</span>
            </div>
          </section>
          <div className="cx-columns">
            <Card title="Cobrado por medio · este mes">
              {summary.byMethod.length === 0 ? <p className="cx-muted">Todavía no hay cobros este mes.</p> : null}
              {summary.byMethod.map((m) => (
                <div className="kv" key={m.method}>
                  <span>{METHOD[m.method] ?? m.method}</span>
                  <b>{formatMoney(m.amount)}</b>
                </div>
              ))}
            </Card>
            <Card title="Conciliación Mercado Pago">
              {review.length === 0 ? <p className="cx-muted">Nada para revisar.</p> : null}
              <div className="rows">
                {review.map((p) => (
                  <div key={p.id}>
                    <span className="grow">
                      <strong>
                        {formatMoney(p.amount)} · {p.payer ? `${p.payer.firstName} ${p.payer.lastName}` : 'sin pagador'}
                      </strong>
                      {p.events.map((e) => (
                        <span key={e.id} className="cx-muted" style={{ display: 'block', fontSize: 'var(--cx-fs-small)' }}>
                          {dateTimeFmt.format(e.at)} · {EVENT[e.kind] ?? e.kind}
                        </span>
                      ))}
                    </span>
                    <span className={`cx-tag ${p.status === 'pending' ? 'cx-tag--info' : 'cx-tag--warn'}`}>{p.status === 'pending' ? 'Verificando' : 'Revisar'}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      ) : null}
      {can('finance:charge.issue') ? (
        <Card title="Cuotas sociales">
          <IssueDuesForm period={periodOf(new Date())} />
        </Card>
      ) : null}
    </AppShell>
  );
}
