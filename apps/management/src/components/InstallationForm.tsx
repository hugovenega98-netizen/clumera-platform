'use client';

import { moduleManifests } from '@clumera/catalog';
import { Button, Field, Notice } from '@clumera/ui';
import { useActionState } from 'react';
import { createInstallationAction, type InstallationFormState } from '../../app/actions';
import { ModulePicker } from './ModulePicker';

const initial: InstallationFormState = { problems: [], values: {}, modules: [], attempt: 0 };

export function InstallationForm() {
  const [state, action, pending] = useActionState(createInstallationAction, initial);
  const v = state.values;
  return (
    // La key vuelve a montar el formulario con lo enviado como valores iniciales.
    <form key={state.attempt} action={action} className="cx-stack">
      {state.problems.length ? (
        <Notice tone="bad">
          <ul>
            {state.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <Field label="Identificador del club" name="clientId" defaultValue={v.clientId} hint="Carpeta clients/<id>/ y CLUMERA_CLIENT_ID. Ej: club-atletico-sur" required pattern="[a-z][a-z0-9-]{1,39}" />
      <Field label="Nombre completo" name="clubName" defaultValue={v.clubName} required />
      <Field label="Nombre visible" name="displayName" defaultValue={v.displayName} hint="El que se ve en la app" required />
      <Field label="Subdominio" name="subdomain" defaultValue={v.subdomain} hint="<subdominio>.clumera.app" required />
      <Field label="Dominio propio (opcional)" name="customDomain" defaultValue={v.customDomain} hint="Servicio opcional contratado" />
      <ModulePicker manifests={moduleManifests.map((m) => ({ id: m.id, name: m.name, dependsOn: m.dependsOn }))} selected={state.modules} />
      <Field label="Cantidad de deportes" name="sportsLimit" type="number" min={0} max={20} defaultValue={v.sportsLimit || 1} />
      <Field label="Vencimiento de la licencia (opcional)" name="expiresAt" type="date" defaultValue={v.expiresAt} />
      <Button type="submit" disabled={pending}>
        Dar de alta
      </Button>
    </form>
  );
}
