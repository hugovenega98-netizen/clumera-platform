'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useActionState } from 'react';
import { loginAction } from '../../app/actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: null });
  return (
    <form action={action} className="cx-stack">
      {state.error ? <Notice tone="bad">{state.error}</Notice> : null}
      <Field label="Email" name="email" type="email" autoComplete="username" required />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" block disabled={pending}>
        Ingresar
      </Button>
    </form>
  );
}
