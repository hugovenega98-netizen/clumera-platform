'use client';

import { Button, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

/** Revocar un carnet: pide el motivo (queda en el historial). */
export function RevokeCredential({ credentialId }: { credentialId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const r = await postJson(`/api/identity/credentials/${credentialId}/revoke`, { reason: form.get('reason') });
    if (!r.ok) return setError(r.error.message);
    setOpen(false);
    router.refresh();
  }
  if (!open)
    return (
      <Button variant="secondary" className="btn-danger" onClick={() => setOpen(true)}>
        Revocar carnet
      </Button>
    );
  return (
    <form onSubmit={submit} className="cx-stack" style={{ flexBasis: '100%' }} aria-label="Revocar carnet">
      <div className="cx-field">
        <label className="cx-label" htmlFor={`reason-${credentialId}`}>
          Motivo
        </label>
        <input id={`reason-${credentialId}`} name="reason" className="cx-input" required minLength={3} maxLength={200} placeholder="Pérdida del teléfono, baja…" />
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <div className="adm-actions">
        <Button type="submit" variant="danger">
          Confirmar revocación
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** Crear la cuenta de la app y mandar el enlace de activación. */
export function InviteAccount({ personId, email }: { personId: string; email: string | null }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError('');
    const mail = String(form.get('email') ?? '').trim();
    const r = await postJson('/api/identity/accounts', { personId, login: mail, email: mail });
    if (!r.ok) return setError(r.error.message);
    setSent(`Enviamos el enlace de activación a ${mail}.`);
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="cx-stack" aria-label="Crear cuenta">
      <div className="cx-field">
        <label className="cx-label" htmlFor="invite-email">
          Email para la cuenta
        </label>
        <input id="invite-email" name="email" type="email" className="cx-input" required defaultValue={email ?? ''} />
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {sent ? <Notice tone="ok">{sent}</Notice> : null}
      <div>
        <Button type="submit">Crear cuenta y enviar activación</Button>
      </div>
    </form>
  );
}
