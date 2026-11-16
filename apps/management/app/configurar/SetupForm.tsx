'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useActionState } from 'react';
import { hashAdminPassword, type SetupState } from './actions';

export function SetupForm() {
  const [state, action, pending] = useActionState<SetupState, FormData>(hashAdminPassword, { hash: null, problems: [] });
  if (state.hash)
    return (
      <div className="cx-stack">
        <Notice tone="ok">Listo. Copiá este valor en la variable MANAGEMENT_ADMIN_PASSWORD_HASH del proyecto de Vercel y volvé a desplegar.</Notice>
        <label className="cx-label" htmlFor="hash">
          MANAGEMENT_ADMIN_PASSWORD_HASH
        </label>
        <textarea id="hash" readOnly value={state.hash} rows={3} className="cx-input" style={{ fontFamily: 'monospace', padding: 12, height: 'auto' }} />
        <p className="cx-muted">Es un hash: no permite recuperar la contraseña. Esta página deja de funcionar en cuanto la variable está cargada.</p>
      </div>
    );
  return (
    <form action={action} className="cx-stack">
      {state.problems.length ? <Notice tone="bad">{state.problems.join(' ')}</Notice> : null}
      <Field label="Contraseña de administración" name="password" type="password" autoComplete="new-password" hint="Al menos 10 caracteres. Puede ser una frase." required />
      <Field label="Repetila" name="confirm" type="password" autoComplete="new-password" required />
      <Button type="submit" disabled={pending}>
        Generar hash
      </Button>
    </form>
  );
}
