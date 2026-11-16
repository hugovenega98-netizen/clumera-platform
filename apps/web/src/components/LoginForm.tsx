'use client';

import { Button, Field, Notice } from '@clumera/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await postJson<{ next: string }>('/api/auth/login', { login: form.get('login'), password: form.get('password'), next });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    router.replace(r.data.next);
    router.refresh();
  }

  return (
    <form className="cx-stack" onSubmit={onSubmit} noValidate>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Field label="Email o usuario" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" block disabled={busy}>
        {busy ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <Link className="cx-link" href="/recuperar">
        Olvidé mi contraseña
      </Link>
    </form>
  );
}
