import { accountFor, formatMoney, periodLabel, receiptNumber } from '@clumera/finance';
import { Card, Notice } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PaySelection } from '@/components/PaySelection';
import { getPrisma } from '@/lib/db';
import { dateFmt } from '@/lib/people-format';
import { getGateway } from '@/lib/services';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Pagos' };
export const dynamic = 'force-dynamic';

const METHOD = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta en el club', mercadopago: 'Mercado Pago' } as const;
const STATUS = { approved: { label: 'Acreditado', tone: 'cx-tag--ok' }, pending: { label: 'Verificando', tone: 'cx-tag--info' }, rejected: { label: 'Rechazado', tone: 'cx-tag--bad' }, refunded: { label: 'Devuelto', tone: '' } } as const;

/** Cuenta unificada del socio: lo suyo y lo de sus representados, por persona y concepto. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ vista?: string; pago?: string }> }) {
  const session = await requireSession('/pagos');
  const sp = await searchParams;
  const view = sp.vista === 'historial' ? 'historial' : 'pendientes';
  const db = getPrisma();
  const account = await accountFor(db, session.personId);
  const returned = sp.pago ? await db.payment.findFirst({ where: { id: sp.pago, payerPersonId: session.personId }, select: { status: true } }) : null;

  const groups = account.people.flatMap((p) =>
    p.groups
      .map((g) => ({
        title: p.isSelf ? g.label : `${p.firstName} · ${g.label}`,
        charges: g.charges
          .filter((c) => c.status === 'pending' && !c.verifying)
          .map((c) => ({
            id: c.id,
            description: c.period ? `${c.description.split(' · ')[0]}` : c.description,
            detail: `${c.overdue ? 'Vencido' : 'Vence'} ${dateFmt.format(c.dueDate)}${c.paidAmount ? ` · pagado ${formatMoney(c.paidAmount)}` : ''}`,
            outstanding: c.outstanding,
            label: formatMoney(c.outstanding),
            overdue: c.overdue,
          })),
      }))
      .filter((g) => g.charges.length),
  );
  const verifying = account.people.flatMap((p) => p.groups.flatMap((g) => g.charges.filter((c) => c.verifying)));
  const settled = account.people.flatMap((p) => p.groups.flatMap((g) => g.charges.filter((c) => c.status === 'paid').map((c) => ({ ...c, who: p.isSelf ? null : p.firstName }))));

  return (
    <AppShell session={session} current="/pagos" title="Pagos">
      <div className="adm-bar">
        <h1>Pagos</h1>
      </div>
      {returned ? (
        returned.status === 'approved' ? (
          <Notice tone="ok">Pago acreditado. Ya podés ver el comprobante en el historial.</Notice>
        ) : returned.status === 'rejected' ? (
          <Notice tone="bad">El pago no se completó. No se debitó nada; podés intentar de nuevo.</Notice>
        ) : (
          <Notice tone="ok">Estamos verificando el pago con Mercado Pago. Se confirma cuando se acredita; te avisamos.</Notice>
        )
      ) : null}
      <section className="kpis" aria-label="Resumen de la cuenta">
        <div className="kpi">
          <span className="cx-muted">Pendiente{account.people.length > 1 ? ' del grupo' : ''}</span>
          <b style={{ color: account.totalPending ? 'var(--cx-warn)' : 'var(--cx-ok)' }}>{account.totalPending ? formatMoney(account.totalPending) : 'Al día'}</b>
          <span className="cx-muted">{account.overdue ? `${formatMoney(account.overdue)} vencido` : 'nada vencido'}</span>
        </div>
        {verifying.length ? (
          <div className="kpi">
            <span className="cx-muted">En verificación</span>
            <b>{formatMoney(verifying.reduce((s, c) => s + c.outstanding, 0))}</b>
            <span className="cx-muted">Mercado Pago</span>
          </div>
        ) : null}
      </section>
      <nav className="cx-tabs" aria-label="Vista de pagos">
        <Link href="/pagos" aria-current={view === 'pendientes' ? 'page' : undefined}>
          Pendientes
        </Link>
        <Link href="/pagos?vista=historial" aria-current={view === 'historial' ? 'page' : undefined}>
          Historial y comprobantes
        </Link>
      </nav>
      {view === 'pendientes' ? (
        groups.length ? (
          <PaySelection groups={groups} online={Boolean(getGateway())} />
        ) : (
          <Card title="Estás al día">
            <p className="cx-muted">No hay nada pendiente{account.people.length > 1 ? ' en tu grupo familiar' : ''}.</p>
          </Card>
        )
      ) : (
        <div className="cx-columns">
          <Card title="Pagos">
            {account.payments.length === 0 ? <p className="cx-muted">Todavía no hay pagos registrados.</p> : null}
            <div className="rows">
              {account.payments.map((p) => (
                <div key={p.id}>
                  <span className="grow">
                    <strong>{formatMoney(p.amount)}</strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {dateFmt.format(p.at)} · {METHOD[p.method]}
                      {p.concepts.length ? ` · ${p.concepts.join(', ')}` : ''}
                    </span>
                  </span>
                  <span className={`cx-tag ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
                  {p.status === 'approved' ? (
                    <Link className="cx-link" href={`/pagos/comprobante/${p.id}`}>
                      {receiptNumber(p.number)}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
          <Card title="Conceptos pagados">
            {settled.length === 0 ? <p className="cx-muted">Sin conceptos pagados en el último año.</p> : null}
            <div className="rows">
              {settled.map((c) => (
                <div key={c.id}>
                  <span className="grow">
                    {c.who ? `${c.who} · ` : ''}
                    {c.period ? `${c.description.split(' · ')[0]}` : c.description}
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {c.period ? periodLabel(c.period) : dateFmt.format(c.dueDate)} · {c.receipts.join(', ')}
                    </span>
                  </span>
                  <span className="pay-item__amount">{formatMoney(c.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
