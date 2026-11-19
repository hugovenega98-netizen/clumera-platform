'use client';

import { Button, Notice } from '@clumera/ui';
import Link from 'next/link';
import { useRef, useState } from 'react';

type Row = { line: number; action: 'create' | 'update' | 'unchanged' | 'error'; name: string; messages: string[]; fields: string[]; personId: string | null };
type Plan = { missing: string[]; counts: Record<Row['action'], number>; rows: Row[]; result?: { created: number; updated: number; failed: Array<{ line: number; message: string }> } };

const ACTION: Record<Row['action'], { label: string; tone: string }> = {
  create: { label: 'Alta', tone: 'cx-tag--ok' },
  update: { label: 'Actualiza', tone: 'cx-tag--info' },
  unchanged: { label: 'Sin cambios', tone: '' },
  error: { label: 'Error', tone: 'cx-tag--bad' },
};
const FIELD: Record<string, string> = { firstName: 'nombre', lastName: 'apellido', document: 'documento', birthDate: 'nacimiento', email: 'email', phone: 'teléfono', membership: 'alta de membresía' };

/** Subir la planilla, revisar qué pasa con cada fila y confirmar. El archivo no se guarda. */
export function ImportPeople() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);

  async function send(mode: 'vista' | 'aplicar') {
    if (!file) return;
    setBusy(true);
    setError('');
    const body = new FormData();
    body.set('archivo', file);
    body.set('modo', mode);
    const res = await fetch('/api/identity/import', { method: 'POST', body }).catch(() => null);
    setBusy(false);
    const data = (await res?.json().catch(() => null)) as (Plan & { error?: { message: string } }) | null;
    if (!res?.ok || !data) return setError(data?.error?.message ?? 'No hay conexión. Probá de nuevo.');
    setPlan(data);
  }

  const done = plan?.result;
  const pending = plan ? plan.counts.create + plan.counts.update : 0;
  const rows = plan ? (onlyProblems ? plan.rows.filter((r) => r.action === 'error' || r.messages.length) : plan.rows) : [];
  return (
    <div className="cx-stack">
      <div className="cx-field">
        <label className="cx-label" htmlFor="import-file">
          Planilla (.xlsx o .csv)
        </label>
        <input
          ref={input}
          id="import-file"
          type="file"
          className="cx-input"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPlan(null);
          }}
        />
      </div>
      <div className="adm-actions">
        <Button onClick={() => send('vista')} disabled={!file || busy}>
          Revisar archivo
        </Button>
        {plan && !done && !plan.missing.length ? (
          <Button variant="primary" onClick={() => send('aplicar')} disabled={busy || pending === 0}>
            Importar {pending} {pending === 1 ? 'persona' : 'personas'}
          </Button>
        ) : null}
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {plan?.missing.length ? <Notice tone="bad">Faltan columnas obligatorias: {plan.missing.join(', ')}. La primera fila tiene que tener los títulos.</Notice> : null}
      {done ? (
        <Notice tone={done.failed.length ? 'bad' : 'ok'}>
          Listo: {done.created} altas y {done.updated} actualizaciones.
          {done.failed.length ? ` No se guardaron ${done.failed.length} filas (${done.failed.map((f) => `fila ${f.line}: ${f.message}`).join('; ')}).` : ''}{' '}
          <Link href="/admin/personas">Ver el padrón</Link>
        </Notice>
      ) : null}
      {plan && !plan.missing.length ? (
        <section className="cx-stack" aria-label="Resultado de la revisión">
          <div className="import-counts">
            {(Object.keys(ACTION) as Row['action'][]).map((k) => (
              <span key={k} className={`cx-tag ${ACTION[k].tone}`}>
                {ACTION[k].label}: {plan.counts[k]}
              </span>
            ))}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
            Ver solo filas con errores o avisos
          </label>
          <div className="rows" role="list" aria-label="Filas">
            {rows.map((r) => (
              <div key={r.line} role="listitem">
                <span className="grow">
                  <span className="cx-muted">Fila {r.line} · </span>
                  {r.personId && r.action !== 'error' ? <Link href={`/admin/personas/${r.personId}`}>{r.name}</Link> : <strong>{r.name}</strong>}
                  {r.fields.length ? <span className="cx-muted" style={{ display: 'block' }}>Cambia: {r.fields.map((f) => FIELD[f] ?? f).join(', ')}</span> : null}
                  {r.messages.map((m) => (
                    <span key={m} style={{ display: 'block', color: r.action === 'error' ? 'var(--cx-bad)' : 'var(--cx-warn)' }}>
                      {m}
                    </span>
                  ))}
                </span>
                <span className={`cx-tag ${ACTION[r.action].tone}`}>{ACTION[r.action].label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
