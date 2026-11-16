'use client';

import { Button, Field, Notice } from '@clumera/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

export function ResetRequestForm() {
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const r = await postJson<{ message: string }>('/api/auth/password-reset/request', { login: new FormData(e.currentTarget).get('login') });
    setBusy(false);
    setMessage(r.ok ? { tone: 'ok', text: r.data.message } : { tone: 'bad', text: r.error.message });
  }

  return (
    <form className="cx-stack" onSubmit={onSubmit} noValidate>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <Field label="Email o usuario" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      <Button type="submit" block disabled={busy}>
        {busy ? 'Enviando…' : 'Mandarme el enlace'}
      </Button>
      <Link className="cx-link" href="/ingresar">
        Volver al ingreso
      </Link>
    </form>
  );
}
