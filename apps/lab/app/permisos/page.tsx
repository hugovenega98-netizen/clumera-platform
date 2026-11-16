import { catalog } from '@clumera/catalog';
import { Card, Notice } from '@clumera/ui';
import { LabShell } from '@/LabShell';
import { guardedDb } from '@/lab';
import { evaluateMatrix } from '@/permissions-eval';
import { LAB_PROFILES } from '@/profiles';

export const dynamic = 'force-dynamic';

/** Módulos encendidos en el core de Lab (su /api/health); si no responde, todos. */
async function coreModules(): Promise<{ modules: Set<string>; source: string }> {
  const core = process.env.LAB_CORE_URL?.replace(/\/+$/, '');
  try {
    const res = await fetch(`${core}/api/health`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { modules: string[] };
    return { modules: new Set(body.modules), source: 'licencia del core de Lab' };
  } catch {
    return { modules: catalog.resolveEnabled(catalog.all.map((m) => m.id)) as Set<string>, source: 'todos los módulos (el core no respondió)' };
  }
}

const cell = { padding: '6px 8px', borderBottom: '1px solid var(--cx-line-soft)', textAlign: 'center' as const, minWidth: 44 };

/**
 * Matriz de permisos con los perfiles de Lab: para cada acción, quién puede y quién no, calculado
 * con `can()` y los roles reales de la base. Una celda roja es una diferencia con lo esperado.
 */
export default async function PermissionsPage() {
  const db = await guardedDb();
  const { modules, source } = await coreModules();
  const { rows, ok } = await evaluateMatrix(db, modules);
  const mismatches = rows.flatMap((r) => r.cells.filter((c) => c.allowed !== c.expected).map((c) => `${r.case.label} · ${c.profile}`));
  return (
    <LabShell current="/permisos">
      <h1>Permisos por perfil</h1>
      <p className="cx-muted">
        Calculado con los roles, ámbitos y membresías sembrados y {source}. ✓ puede · — no puede. Cada acción nueva suma su fila en{' '}
        <code>apps/lab/src/permissions-matrix.ts</code>.
      </p>
      {ok ? (
        <Notice tone="ok">Todo coincide con lo esperado.</Notice>
      ) : (
        <Notice tone="bad">
          {mismatches.length} diferencia(s): {mismatches.join(' · ')}
        </Notice>
      )}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 'var(--cx-fs-small)' }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: 'left' }}>Acción</th>
                {LAB_PROFILES.map((p) => (
                  <th key={p.key} style={cell} scope="col">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.case.id} data-case={r.case.id}>
                  <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400, minWidth: 220 }}>
                    {r.case.label}
                    <div className="cx-muted">
                      <code>{r.case.action}</code>
                    </div>
                  </th>
                  {r.cells.map((c) => (
                    <td
                      key={c.profile}
                      style={{ ...cell, background: c.allowed !== c.expected ? 'var(--cx-bad-bg)' : undefined }}
                      title={c.reason}
                      aria-label={`${c.profile}: ${c.allowed ? 'puede' : 'no puede'}${c.allowed !== c.expected ? ' (no esperado)' : ''}`}
                    >
                      {c.allowed ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </LabShell>
  );
}
