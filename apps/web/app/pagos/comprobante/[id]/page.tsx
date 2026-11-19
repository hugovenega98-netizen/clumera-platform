import { formatMoney, receipt, receiptNumber } from '@clumera/finance';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { PrintButton } from '@/components/PrintButton';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { canViewAccount } from '@/lib/finance-access';
import { dateTimeFmt } from '@/lib/people-format';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Comprobante' };
export const dynamic = 'force-dynamic';

const METHOD: Record<string, string> = { cash: 'Efectivo', transfer: 'Transferencia', card: 'Tarjeta en el club', mercadopago: 'Mercado Pago' };

/** Comprobante de pago. Lo ven quien pagó, las personas cuyos cargos cancela (y sus responsables) y Finanzas. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/pagos/comprobante/${id}`);
  const r = await receipt(getPrisma(), id);
  if (!r || r.status !== 'approved') notFound();
  const allowed = r.payer?.id === session.personId || (await Promise.all(r.ownerIds.map((o) => canViewAccount(session.personId, o)))).some(Boolean);
  if (!allowed) forbidden();
  return (
    <AppShell session={session} current="/pagos" title="Comprobante">
      <nav aria-label="Ruta" className="no-print">
        <Link className="cx-link" href="/pagos?vista=historial">
          ← Historial
        </Link>
      </nav>
      <Card className="receipt">
        <div className="receipt__head">
          <div>
            <div className="cx-muted">{clientConfig.identity.clubName}</div>
            <h1>Comprobante {receiptNumber(r.number)}</h1>
          </div>
          <span className="cx-tag cx-tag--ok">Pagado</span>
        </div>
        <div className="kv">
          <span>Fecha</span>
          <b>{dateTimeFmt.format(r.at)}</b>
        </div>
        <div className="kv">
          <span>Pagó</span>
          <b>{r.payer?.name ?? '—'}</b>
        </div>
        <div className="kv">
          <span>Medio</span>
          <b>{METHOD[r.method] ?? r.method}</b>
        </div>
        <table className="receipt__lines" aria-label="Conceptos">
          <thead>
            <tr>
              <th scope="col">Concepto</th>
              <th scope="col">Persona</th>
              <th scope="col" className="num">
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td>
                <td>{l.person}</td>
                <td className="num">{formatMoney(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total
              </th>
              <td className="num">
                <b>{formatMoney(r.amount)}</b>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
          Comprobante interno del club. No válido como factura.
        </p>
        <div className="no-print">
          <PrintButton />
        </div>
      </Card>
    </AppShell>
  );
}
