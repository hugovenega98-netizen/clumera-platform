'use client';

import { formatMoney } from '@clumera/finance/money';
import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { postJson } from './forms';

type Msg = { tone: 'ok' | 'bad'; text: string } | null;

async function send(method: 'PUT' | 'DELETE', url: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!res) return { ok: false as const, message: 'No hay conexión. Probá de nuevo.' };
  if (res.ok) return { ok: true as const };
  return { ok: false as const, message: ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? 'No se pudo.' };
}

/** Inscribir a un chico en un grupo de la colonia y pasar a su documentación. */
export function CampEnrollButton({ groupId, personId, who, waitlist }: { groupId: string; personId: string; who: string; waitlist: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    const r = await postJson<{ id: string }>('/api/m/summer/enrollments', { groupId, personId });
    if (r.ok) return router.push(`/verano/inscripcion/${r.data.id}`);
    setBusy(false);
    setError(r.error.message);
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)', alignItems: 'flex-end' }}>
      <Button variant={waitlist ? 'secondary' : 'primary'} onClick={go} disabled={busy} aria-label={`${waitlist ? 'Anotar en espera' : 'Inscribir'} a ${who}`}>
        {busy ? 'Guardando…' : waitlist ? 'Anotar en espera' : 'Inscribir'}
      </Button>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}

/** Subir (o reemplazar) un documento: PDF o foto hasta 4 MB. */
export function CampDocumentUpload({ enrollmentId, code, label, replace }: { enrollmentId: string; code: string; label: string; replace: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(file: File) {
    if (file.size > 4 * 1024 * 1024) return setError('El archivo supera los 4 MB.');
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/m/summer/enrollments/${enrollmentId}/documents/${code}`, { method: 'POST', body: form }).catch(() => null);
    setBusy(false);
    if (!res) return setError('No hay conexión. Probá de nuevo.');
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? 'No se pudo subir.');
    if (input.current) input.current.value = '';
    router.refresh();
  }
  return (
    <span className="cx-stack" style={{ gap: 'var(--cx-space-1)', alignItems: 'flex-end' }}>
      <label className={`cx-btn cx-btn--secondary${busy ? ' is-busy' : ''}`}>
        {busy ? 'Subiendo…' : replace ? 'Reemplazar' : 'Subir'}
        <input
          ref={input}
          type="file"
          className="cx-sr-only"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-label={`${replace ? 'Reemplazar' : 'Subir'} ${label}`}
          disabled={busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
      </label>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </span>
  );
}

/** Uso de imagen y contacto de emergencia. */
export function CampDetailsForm({ id, initial }: { id: string; initial: { imageConsent: boolean; emergencyName: string; emergencyPhone: string } }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await send('PUT', `/api/m/summer/enrollments/${id}/details`, v);
    setMsg(r.ok ? { tone: 'ok', text: 'Datos guardados.' } : { tone: 'bad', text: r.message });
  }
  return (
    <form className="cx-stack" onSubmit={submit} aria-label="Salud y emergencias">
      <h2 className="home-sec" style={{ margin: 0 }}>
        Salud y emergencias
      </h2>
      <Field label="Contacto de emergencia" name="emergencyName" required value={v.emergencyName} onChange={(e) => setV({ ...v, emergencyName: e.target.value })} />
      <Field label="Teléfono de emergencia" name="emergencyPhone" type="tel" inputMode="tel" required value={v.emergencyPhone} onChange={(e) => setV({ ...v, emergencyPhone: e.target.value })} />
      <label className="check-row">
        <input type="checkbox" role="switch" checked={v.imageConsent} onChange={(e) => setV({ ...v, imageConsent: e.target.checked })} />
        Autorizo el uso de imagen en las redes del club
      </label>
      {msg ? (
        <p className={`callup-status callup-status--${msg.tone}`} role="status">
          {msg.text}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="secondary">
          Guardar
        </Button>
      </div>
    </form>
  );
}

/** Autorizar a otra persona a retirar al chico (con su documento). */
export function PickupForm({ minorId }: { minorId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const empty = { firstName: '', lastName: '', relation: '', document: '', phone: '' };
  const [v, setV] = useState(empty);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson('/api/identity/pickups', { minorId, ...v, phone: v.phone || undefined });
    if (!r.ok) return setError(r.error.message);
    setV(empty);
    setOpen(false);
    setError('');
    router.refresh();
  }
  if (!open)
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          + Agregar persona autorizada
        </Button>
      </div>
    );
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Persona autorizada a retirar">
      <Field label="Nombre" name="firstName" required value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />
      <Field label="Apellido" name="lastName" required value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />
      <Field label="Vínculo" name="relation" required placeholder="Abuela, tío, vecina…" value={v.relation} onChange={(e) => setV({ ...v, relation: e.target.value })} />
      <Field label="DNI" name="document" required inputMode="numeric" hint="Se guarda protegido: solo se muestran los últimos 4." value={v.document} onChange={(e) => setV({ ...v, document: e.target.value })} />
      <Field label="Celular (opcional)" name="phone" type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      <div className="span-2 cx-stack">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <div className="adm-actions">
          <Button type="submit">Autorizar</Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  );
}

export function RevokePickup({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function go() {
    const r = await send('DELETE', `/api/identity/pickups/${id}`);
    if (!r.ok) return setError(r.message);
    router.refresh();
  }
  return (
    <span className="cx-stack" style={{ gap: 'var(--cx-space-1)', alignItems: 'flex-end' }}>
      <Button variant="secondary" onClick={go} aria-label={`Quitar a ${name}`}>
        Quitar
      </Button>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </span>
  );
}

/** Pagar la inscripción con Mercado Pago. */
export function CampPay({ chargeId, amount }: { chargeId: string; amount: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    const r = await postJson<{ checkoutUrl: string }>('/api/finance/checkout', { chargeIds: [chargeId] });
    if (r.ok) return location.assign(r.data.checkoutUrl);
    setBusy(false);
    setError(r.error.message);
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <Button block onClick={go} disabled={busy}>
        {busy ? 'Abriendo Mercado Pago…' : `Pagar ${formatMoney(amount)}`}
      </Button>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}

/** Baja (o salir de la espera) con motivo. */
export function WithdrawCamp({ id, name, waiting }: { id: string; name: string; waiting: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson(`/api/m/summer/enrollments/${id}/withdraw`, { reason });
    if (!r.ok) return setError(r.error.message);
    router.push('/verano');
  }
  if (!open)
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`${waiting ? 'Salir de la espera' : 'Dar de baja'}: ${name}`}>
          {waiting ? 'Salir de la espera' : 'Dar de baja'}
        </Button>
      </div>
    );
  return (
    <form className="cx-stack" onSubmit={submit} aria-label={`Baja de la colonia: ${name}`}>
      <Field label="Motivo" name="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} hint="Si el pago no se hizo, el cargo se anula." />
      <div className="adm-actions">
        <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>
          Confirmar baja
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Volver
        </Button>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </form>
  );
}

/** Coordinación: aprobar o rechazar (con motivo) un documento. */
export function ReviewDocument({ id, label, who }: { id: string; label: string; who: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  async function review(approve: boolean) {
    const r = await postJson(`/api/m/summer/documents/${id}/review`, { approve, note: approve ? undefined : note });
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      {rejecting ? (
        <form
          className="cx-stack"
          aria-label={`Rechazar ${label} de ${who}`}
          onSubmit={(e) => {
            e.preventDefault();
            void review(false);
          }}
        >
          <Field label="Motivo del rechazo" name="note" required minLength={5} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="adm-actions">
            <Button type="submit" variant="danger" disabled={note.trim().length < 5}>
              Rechazar
            </Button>
            <Button variant="secondary" onClick={() => setRejecting(false)}>
              Volver
            </Button>
          </div>
        </form>
      ) : (
        <div className="adm-actions">
          <Button onClick={() => review(true)} aria-label={`Aprobar ${label} de ${who}`}>
            Aprobar
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(true)} aria-label={`Rechazar ${label} de ${who}`}>
            Rechazar
          </Button>
        </div>
      )}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}
