'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

/** Elegir contraseña con un enlace de un solo uso (activación o recuperación). */
export function SetPasswordForm({ token, endpoint, submitLabel }: { token: string; endpoint: string; submitLabel: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== form.get('confirm')) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    setError(null);
    const r = await postJson(endpoint, { token, password });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    router.replace('/');
    router.refresh();
  }

  if (!token) return <Notice tone="bad">Falta el enlace. Abrí el link que te llegó por correo.</Notice>;
  return (
    <form className="cx-stack" onSubmit={onSubmit} noValidate>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Field label="Contraseña nueva" name="password" type="password" autoComplete="new-password" hint="Al menos 10 caracteres. Puede ser una frase." required />
      <Field label="Repetila" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" block disabled={busy}>
        {busy ? 'Guardando…' : submitLabel}
      </Button>
    </form>
  );
}
