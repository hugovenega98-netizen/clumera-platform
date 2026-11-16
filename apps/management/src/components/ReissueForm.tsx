'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { moduleManifests } from '@clumera/catalog';
import { useActionState } from 'react';
import { ModulePicker } from './ModulePicker';
import { reissueLicenseAction } from '../../app/actions';

export function ReissueForm({ installationId, sportsLimit, selected }: { installationId: string; sportsLimit: number; selected: string[] }) {
  const [state, action, pending] = useActionState(reissueLicenseAction, { problems: [] });
  return (
    <form action={action} className="cx-stack">
      {state.problems.length ? <Notice tone="bad">{state.problems.join(' · ')}</Notice> : null}
      <input type="hidden" name="installationId" value={installationId} />
      <ModulePicker manifests={moduleManifests.map((m) => ({ id: m.id, name: m.name, dependsOn: m.dependsOn }))} selected={selected} />
      <Field label="Cantidad de deportes" name="sportsLimit" type="number" min={0} max={20} defaultValue={sportsLimit} />
      <Field label="Vencimiento (opcional)" name="expiresAt" type="date" />
      <Button type="submit" variant="secondary" disabled={pending}>
        Emitir licencia nueva
      </Button>
    </form>
  );
}
