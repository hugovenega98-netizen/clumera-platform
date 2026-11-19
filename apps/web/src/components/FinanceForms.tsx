'use client';

import { Button, Field, Notice } from '@clumera/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { formatMoney as money, parseMoney } from '@clumera/finance/money';
import { postJson } from './forms';

/** «18.500» o «18500,50» → centavos. */
const parseAmount = parseMoney;

export interface LedgerRow {
  id: string;
  group: string;
  description: string;
  when: string;
  amount: number;
  paid: number;
  outstanding: number;
  status: 'pending' | 'paid' | 'cancelled';
  overdue: boolean;
  verifying: boolean;
  receipts: Array<{ id: string; label: string }>;
}

/**
 * Cuenta por concepto (buscador central): seleccionar pendientes y registrar el cobro, o anular un
 * cargo sin pagos. Los permisos los decide el servidor; acá solo se esconden acciones.
 */
export function AccountLedger({ personId, rows, canRecord, canIssue }: { personId: string; rows: LedgerRow[]; canRecord: boolean; canIssue: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; label: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<LedgerRow | null>(null);
  const [reason, setReason] = useState('');
  const total = useMemo(() => rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.outstanding, 0), [rows, selected]);
  const groups = useMemo(() => [...new Set(rows.map((r) => r.group))], [rows]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function record(e: FormEvent) {
    e.preventDefault();
    setError('');
    setDone(null);
    const cents = amount.trim() ? parseAmount(amount) : total;
    if (!cents) return setError('Monto inválido. Escribilo como 18.500 o 18500,50.');
    setBusy(true);
    const r = await postJson<{ id: string; number: number }>('/api/finance/payments', { payerPersonId: personId, chargeIds: [...selected], method, amount: cents, note: note || undefined });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setDone({ id: r.data.id, label: `R-${String(r.data.number).padStart(6, '0')}` });
    setSelected(new Set());
    setAmount('');
    setNote('');
    router.refresh();
  }
  async function cancel(e: FormEvent) {
    e.preventDefault();
    if (!cancelling) return;
    const r = await postJson(`/api/finance/charges/${cancelling.id}/cancel`, { reason });
    if (!r.ok) return setError(r.error.message);
    setCancelling(null);
    setReason('');
    router.refresh();
  }

  return (
    <div className="cx-stack">
      {done ? (
        <Notice tone="ok">
          Cobro registrado.{' '}
          <Link className="cx-link" href={`/pagos/comprobante/${done.id}`}>
            Ver comprobante {done.label}
          </Link>
        </Notice>
      ) : null}
      {rows.length === 0 ? (
        <p className="cx-muted">Sin movimientos en el último año.</p>
      ) : (
        <table className="ledger" aria-label="Cuenta por concepto">
          <thead>
            <tr>
              {canRecord ? (
                <th scope="col">
                  <span className="cx-sr-only">Elegir</span>
                </th>
              ) : null}
              <th scope="col">Concepto</th>
              <th scope="col">Vencimiento</th>
              <th scope="col" className="money">
                Emitido
              </th>
              <th scope="col" className="money">
                Pagado
              </th>
              <th scope="col">Estado</th>
              <th scope="col">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => [
              <tr className="grp" key={`g-${g}`}>
                <td colSpan={canRecord ? 7 : 6}>{g}</td>
              </tr>,
              ...rows
                .filter((r) => r.group === g)
                .map((r) => (
                  <tr key={r.id}>
                    {canRecord ? (
                      <td>{r.status === 'pending' && !r.verifying ? <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Cobrar ${r.description}`} /> : null}</td>
                    ) : null}
                    <td className="desc">{r.description}</td>
                    <td className="hide-sm">{r.when}</td>
                    <td className="money hide-sm">{money(r.amount)}</td>
                    <td className="money hide-sm">{money(r.paid)}</td>
                    <td>
                      {r.status === 'paid' ? (
                        <span className="cx-tag cx-tag--ok">Pagado</span>
                      ) : r.verifying ? (
                        <span className="cx-tag cx-tag--info">Verificando</span>
                      ) : (
                        <span className={`cx-tag ${r.overdue ? 'cx-tag--bad' : 'cx-tag--warn'}`}>
                          {r.overdue ? 'Vencido' : 'Pendiente'} · {money(r.outstanding)}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.receipts.map((x) => (
                        <Link key={x.id} className="cx-link" href={`/pagos/comprobante/${x.id}`} style={{ marginRight: 8 }}>
                          {x.label}
                        </Link>
                      ))}
                      {canIssue && r.status === 'pending' && r.paid === 0 && !r.verifying ? (
                        <button type="button" className="cx-link-button" onClick={() => setCancelling(r)} aria-label={`Anular ${r.description}`}>
                          Anular
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )),
            ])}
          </tbody>
        </table>
      )}
      {cancelling ? (
        <form className="cx-card" onSubmit={cancel} aria-label="Anular cargo">
          <h2 className="cx-card__title">Anular «{cancelling.description}»</h2>
          <Field label="Motivo" value={reason} onChange={(ev) => setReason(ev.target.value)} required minLength={3} maxLength={200} placeholder="Error de carga, beca…" />
          <div className="adm-actions">
            <Button type="submit" variant="danger">
              Confirmar anulación
            </Button>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Volver
            </Button>
          </div>
        </form>
      ) : null}
      {canRecord && selected.size ? (
        <form className="cx-card record-form" onSubmit={record} aria-label="Registrar cobro">
          <h2 className="cx-card__title">Registrar cobro · {money(total)}</h2>
          <div className="form-grid">
            <div className="cx-field">
              <label className="cx-label" htmlFor="pay-method">
                Medio
              </label>
              <select id="pay-method" className="cx-select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta (posnet)</option>
              </select>
            </div>
            <Field label="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={money(total)} hint="Vacío: el total elegido. Menos: pago parcial." />
            <Field label="Nota" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="span-2" placeholder="N° de transferencia, observaciones…" />
          </div>
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <div>
            <Button type="submit" disabled={busy}>
              Registrar cobro
            </Button>
          </div>
        </form>
      ) : error ? (
        <Notice tone="bad">{error}</Notice>
      ) : null}
    </div>
  );
}

/** Emitir un cargo manual a una persona. */
export function IssueChargeForm({ personId }: { personId: string }) {
  const router = useRouter();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cents = parseAmount(String(f.get('amount') ?? ''));
    if (!cents) return setError('Monto inválido. Escribilo como 18.500 o 18500,50.');
    setError('');
    const r = await postJson<{ created: boolean }>('/api/finance/charges', {
      personId,
      concept: f.get('concept'),
      groupLabel: String(f.get('groupLabel') ?? '').trim() || 'Otros',
      description: f.get('description'),
      amount: cents,
      dueDate: f.get('dueDate'),
      requestId,
    });
    if (!r.ok) return setError(r.error.message);
    setDone('Cargo emitido.');
    setRequestId(crypto.randomUUID());
    e.currentTarget?.reset();
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Emitir cargo">
      <div className="cx-field">
        <label className="cx-label" htmlFor="concept">
          Tipo
        </label>
        <select id="concept" name="concept" className="cx-select" defaultValue="arancel">
          <option value="arancel">Arancel deportivo</option>
          <option value="cuota_social">Cuota social</option>
          <option value="colonia">Colonia / actividades</option>
          <option value="reserva">Reserva</option>
          <option value="evento">Evento</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      <Field label="Agrupar como" name="groupLabel" maxLength={60} placeholder="Rugby XV, Servicios…" />
      <Field label="Concepto" name="description" required minLength={3} maxLength={120} className="span-2" placeholder="Arancel noviembre" />
      <Field label="Monto" name="amount" required inputMode="decimal" placeholder="18.500" />
      <Field label="Vence" name="dueDate" type="date" required />
      <div className="span-2 cx-stack">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        {done ? <Notice tone="ok">{done}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Emitir cargo
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Emitir las cuotas sociales del período (idempotente). */
export function IssueDuesForm({ period }: { period: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await postJson<{ issued: number; skipped: number }>('/api/finance/dues', { period: f.get('period'), dueDay: Number(f.get('dueDay')) });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    const { issued, skipped } = r.data;
    const already = skipped === 1 ? '1 ya estaba' : `${skipped} ya estaban`;
    setMsg({
      tone: 'ok',
      text: issued ? `${issued === 1 ? 'Emitida 1 cuota' : `Emitidas ${issued} cuotas`}${skipped ? ` (${already})` : ''}.` : `No había cuotas nuevas: ${skipped === 1 ? 'la única ya estaba emitida' : `las ${skipped} ya estaban emitidas`}.`,
    });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Emitir cuotas del mes">
      <Field label="Período" name="period" type="month" defaultValue={period} required />
      <Field label="Día de vencimiento" name="dueDay" type="number" min={1} max={28} defaultValue={10} required />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
          Una cuota por membresía vigente con cuota en su categoría. Volver a emitir no duplica.
        </p>
        <div>
          <Button type="submit">Emitir cuotas</Button>
        </div>
      </div>
    </form>
  );
}
