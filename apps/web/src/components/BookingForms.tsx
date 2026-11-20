'use client';

import { formatMoney } from '@clumera/finance/money';
import { Button, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './forms';

type Option = { mode: 'full' | 'deposit' | 'club'; amount: number; available: boolean; note: string };
const MODE_LABEL: Record<Option['mode'], string> = { full: 'Pago completo', deposit: 'Seña', club: 'Pagar en el club' };

async function goPay(chargeId: string): Promise<string | null> {
  const r = await postJson<{ checkoutUrl: string }>('/api/finance/checkout', { chargeIds: [chargeId] });
  if (!r.ok) return r.error.message;
  location.assign(r.data.checkoutUrl);
  return null;
}

/** Confirmar y pagar: elegir forma de pago, retener el turno e ir a Mercado Pago. */
export function BookingCheckout({ venueId, startsAt, price, options, holdMinutes, cancelHours }: { venueId: string; startsAt: string; price: number; options: Option[]; holdMinutes: number; cancelHours: number }) {
  const router = useRouter();
  const first = options.find((o) => o.available)?.mode ?? 'full';
  const [mode, setMode] = useState<Option['mode']>(first);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = options.find((o) => o.mode === mode)!;
  async function submit() {
    setBusy(true);
    setError('');
    const r = await postJson<{ id: string; status: 'held' | 'confirmed'; chargeId: string | null }>('/api/m/bookings', { venueId, startsAt, payMode: mode });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error.message);
    }
    if (r.data.status === 'confirmed' || !r.data.chargeId) return router.push('/reservas?vista=mias&ok=1');
    const problem = await goPay(r.data.chargeId);
    if (problem) {
      setBusy(false);
      setError(`${problem} El turno queda retenido unos minutos: podés pagarlo desde «Mis reservas».`);
    }
  }
  return (
    <div className="cx-stack">
      <fieldset className="pay-options">
        <legend className="cx-sr-only">Forma de pago</legend>
        {options.map((o) => (
          <label key={o.mode} className={`pay-option${mode === o.mode ? ' pay-option--on' : ''}${o.available ? '' : ' pay-option--off'}`}>
            <input type="radio" name="payMode" value={o.mode} checked={mode === o.mode} disabled={!o.available} onChange={() => setMode(o.mode)} />
            <span>
              <strong>{MODE_LABEL[o.mode]}</strong>
              <span className="cx-muted">{o.available ? `${o.mode === 'club' ? formatMoney(price) : formatMoney(o.amount)} · ${o.note}` : 'El club no lo habilita para este espacio'}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
        Cancelación sin cargo hasta {cancelHours} h antes; después se retiene lo pagado.{' '}
        {mode === 'club' ? 'La reserva queda confirmada y el cargo, en tu cuenta.' : `Al continuar, el turno queda retenido ${holdMinutes} minutos y se confirma cuando Mercado Pago acredita el pago.`}
      </p>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button block onClick={submit} disabled={busy || !chosen.available}>
        {mode === 'club' ? 'Confirmar reserva' : `Pagar ${formatMoney(chosen.amount)} con Mercado Pago`}
      </Button>
    </div>
  );
}

/** Acciones de una reserva propia (o del encargado): pagar lo retenido, cancelar. */
export function BookingActions({ id, chargeId, payable, cancellable, title, manager = false }: { id: string; chargeId: string | null; payable: boolean; cancellable: boolean; title: string; manager?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(false);
  async function cancel() {
    const r = await postJson<{ refundDue: number }>(`/api/m/bookings/${id}/cancel`, {});
    if (!r.ok) return setError(r.error.message);
    setAsk(false);
    router.refresh();
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <div className="adm-actions">
        {payable && chargeId ? (
          <Button
            onClick={async () => {
              const e = await goPay(chargeId);
              if (e) setError(e);
            }}
          >
            Pagar ahora
          </Button>
        ) : null}
        {cancellable && !ask ? (
          <Button variant="secondary" onClick={() => setAsk(true)} aria-label={`Cancelar reserva: ${title}`}>
            Cancelar
          </Button>
        ) : null}
        {ask ? (
          <>
            <Button variant="danger" onClick={cancel}>
              {manager ? 'Sí, cancelar y avisar' : 'Sí, cancelar'}
            </Button>
            <Button variant="secondary" onClick={() => setAsk(false)}>
              No
            </Button>
          </>
        ) : null}
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}
