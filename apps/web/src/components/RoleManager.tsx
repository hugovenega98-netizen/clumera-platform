'use client';

import { Button, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from './forms';

export interface RoleOption {
  code: string;
  name: string;
}

const SCOPES = [
  { value: 'club', label: 'Todo el club' },
  { value: 'sport', label: 'Un deporte' },
  { value: 'team', label: 'Un equipo o categoría' },
  { value: 'venue', label: 'Un espacio' },
  { value: 'resource', label: 'Un recurso (cancha, pileta…)' },
  { value: 'event', label: 'Un evento' },
  { value: 'activity', label: 'Una actividad o escuela' },
];

/** Asignar un rol con su ámbito. Los ámbitos ya usados en el club se sugieren mientras se escribe. */
export function AssignRoleForm({ personId, roles, known }: { personId: string; roles: RoleOption[]; known: Array<{ scopeType: string; scopeId: string }> }) {
  const router = useRouter();
  // Controlados: React vacía los formularios con action al enviar, y un error no debe borrar lo elegido.
  const [roleCode, setRoleCode] = useState(roles[0]?.code ?? '');
  const [scopeType, setScopeType] = useState('club');
  const [scopeId, setScopeId] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError('');
    setDone('');
    const r = await postJson(`/api/identity/people/${personId}/roles`, { roleCode, scopeType, scopeId: scopeType === 'club' ? undefined : scopeId });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setDone('Rol asignado.');
    router.refresh();
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="form-grid"
      aria-label="Asignar un rol"
    >
      <div className="cx-field">
        <label className="cx-label" htmlFor="role-code">
          Rol
        </label>
        <select id="role-code" name="roleCode" className="cx-select" required value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
          {roles.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="cx-field">
        <label className="cx-label" htmlFor="scope-type">
          Alcance
        </label>
        <select id="scope-type" className="cx-select" value={scopeType} onChange={(e) => setScopeType(e.target.value)}>
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {scopeType !== 'club' ? (
        <div className="cx-field span-2">
          <label className="cx-label" htmlFor="scope-id">
            ¿Cuál?
          </label>
          <input id="scope-id" name="scopeId" className="cx-input" required value={scopeId} onChange={(e) => setScopeId(e.target.value)} pattern="[a-z0-9][a-z0-9-]*" list="known-scopes" placeholder="por ejemplo rugby-m19" aria-describedby="scope-hint" />
          <span id="scope-hint" className="cx-hint">
            Identificador en minúsculas, con guiones.
          </span>
          <datalist id="known-scopes">
            {known
              .filter((k) => k.scopeType === scopeType)
              .map((k) => (
                <option key={k.scopeId} value={k.scopeId} />
              ))}
          </datalist>
        </div>
      ) : null}
      <div className="span-2 cx-stack">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        {done ? <Notice tone="ok">{done}</Notice> : null}
        <div>
          <Button type="submit" disabled={busy}>
            Asignar rol
          </Button>
        </div>
      </div>
    </form>
  );
}

export function RemoveRoleButton({ personId, assignmentId, label }: { personId: string; assignmentId: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function remove() {
    setError('');
    const res = await fetch(`/api/identity/people/${personId}/roles/${assignmentId}`, { method: 'DELETE' }).catch(() => null);
    if (!res) return setError('No hay conexión.');
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? 'No se pudo quitar.');
    router.refresh();
  }
  return (
    <>
      <Button variant="secondary" className="btn-danger" onClick={remove} aria-label={`Quitar ${label}`}>
        Quitar
      </Button>
      {error ? (
        <span role="alert" className="cx-error" style={{ flexBasis: '100%' }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
