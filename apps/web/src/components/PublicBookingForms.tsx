'use client';

import { formatMoney } from '@clumera/finance/money';
import { Button, Field, Notice } from '@clumera/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

type Option = { mode: 'full' | 'deposit' | 'club'; amount: number; available: boolean; note: string };

/**
 * Reservar sin cuenta: nombre, celular, email y condiciones; retiene el turno y va a Mercado Pago.
 * Si el email es de una persona del club, la manda a ingresar (tarifa socio, sin cargos ajenos).
 */
export function GuestBookingForm({ venueId, startsAt, options, cancelHours, holdMinutes }: { venueId: string; startsAt: string; options: Option[]; cancelHours: number; holdMinutes: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<'full' | 'deposit'>(options.some((o) => o.mode === 'deposit') ? 'deposit' : 'full');
  const [v, setV] = useState({ name: '', phone: '', email: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; login?: boolean } | null>(null);
  const chosen = options.find((o) => o.mode === mode) ?? options[0]!;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!terms) return setError({ text: 'Aceptá las condiciones para reservar.' });
    setBusy(true);
    setError(null);
    const r = await postJson<{ link: string; checkoutUrl: string | null; payError: string | null }>('/api/m/bookings/public', { venueId, startsAt, payMode: chosen.mode, ...v, terms });
    if (!r.ok) {
      setBusy(false);
      return setError({ text: r.error.message, login: r.error.details?.reason === 'member_email' });
    }
    if (r.data.checkoutUrl) return location.assign(r.data.checkoutUrl);
    router.push(`${r.data.link}?pago=error`);
  }

  return (
    <form className="cx-stack" onSubmit={submit} aria-label="Reservar sin cuenta" noValidate>
      <Field label="Nombre y apellido" name="name" autoComplete="name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Field label="Celular (WhatsApp)" name="phone" type="tel" inputMode="tel" autoComplete="tel" required value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      <Field label="Email" name="email" type="email" autoComplete="email" required hint="Te mandamos la confirmación y el enlace para gestionar la reserva." value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
      {options.length > 1 ? (
        <fieldset className="pay-options">
          <legend className="cx-label">Forma de pago</legend>
          {options.map((o) => (
            <label key={o.mode} className={`pay-option${mode === o.mode ? ' pay-option--on' : ''}`}>
              <input type="radio" name="payMode" value={o.mode} checked={mode === o.mode} onChange={() => setMode(o.mode as 'full' | 'deposit')} />
              <span>
                <strong>{o.mode === 'deposit' ? 'Seña' : 'Pago completo'}</strong>
                <span className="cx-muted">
                  {formatMoney(o.amount)} · {o.note}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <label className="check-row">
        <input type="checkbox" name="terms" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        Acepto las condiciones: cancelación sin cargo hasta {cancelHours} h antes.
      </label>
      <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
        El turno queda retenido {holdMinutes} minutos y se confirma cuando Mercado Pago acredita el pago. Te llega la confirmación por correo.
      </p>
      {error ? (
        <Notice tone="bad">
          {error.text}
          {error.login ? (
            <>
              {' '}
              <Link className="cx-link" href={`/ingresar?next=${encodeURIComponent(`/reservas/confirmar?espacio=${venueId}&inicio=${startsAt}`)}`}>
                Ingresar
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}
      <Button type="submit" block disabled={busy}>
        {chosen.mode === 'deposit' ? `Pagar seña ${formatMoney(chosen.amount)}` : `Pagar ${formatMoney(chosen.amount)}`}
      </Button>
    </form>
  );
}

/** Acciones con el enlace firmado de la reserva: pagar lo retenido, cancelar. */
export function GuestBookingActions({ token, payable, cancellable, title }: { token: string; payable: boolean; cancellable: boolean; title: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function pay() {
    setBusy(true);
    const r = await postJson<{ checkoutUrl: string }>(`/api/m/bookings/public/${token}/pay`, {});
    if (r.ok) return location.assign(r.data.checkoutUrl);
    setBusy(false);
    setError(r.error.message);
    router.refresh();
  }
  async function cancel() {
    setBusy(true);
    const r = await postJson(`/api/m/bookings/public/${token}/cancel`, {});
    setBusy(false);
    setAsk(false);
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <div className="adm-actions">
        {payable ? (
          <Button onClick={pay} disabled={busy}>
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
            <Button variant="danger" onClick={cancel} disabled={busy}>
              Sí, cancelar
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
