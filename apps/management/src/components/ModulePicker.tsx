/** Casillas de los ocho módulos licenciables, con sus dependencias a la vista. */
export function ModulePicker({ manifests, selected = [] }: { manifests: Array<{ id: string; name: string; dependsOn: string[] }>; selected?: string[] }) {
  const names = Object.fromEntries(manifests.map((m) => [m.id, m.name]));
  return (
    <fieldset className="cx-stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="cx-label">Módulos contratados</legend>
      {manifests.map((m) => (
        <label key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" name="modules" value={m.id} defaultChecked={selected.includes(m.id)} style={{ width: 20, height: 20 }} />
          <span>
            <strong>{m.name}</strong>
            {m.dependsOn.length ? <span className="cx-muted"> · necesita {m.dependsOn.map((d) => names[d] ?? d).join(', ')}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
