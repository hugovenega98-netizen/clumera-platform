'use client';

import type { Space } from '@clumera/identity';
import { Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Selector de espacio activo: una sola cuenta, un espacio por cada participación en el club. */
export function SpaceSwitcher({ spaces, active }: { spaces: Space[]; active: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(active);
  const [error, setError] = useState('');
  async function choose(space: Space) {
    setError('');
    const res = await fetch('/api/auth/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: space.key }) });
    if (!res.ok) return setError('No se pudo cambiar de espacio. Probá de nuevo.');
    setCurrent(space.key);
    router.refresh();
  }
  return (
    <>
      <div className="spaces" role="radiogroup" aria-label="Espacios">
        {spaces.map((s) => (
          <button key={s.key} type="button" role="radio" aria-checked={s.key === current} className="space" onClick={() => choose(s)}>
            <span className="space__radio" aria-hidden="true" />
            <span>
              <strong>{s.label}</strong>
              <span className="cx-muted" style={{ display: 'block' }}>
                {s.detail}
              </span>
            </span>
          </button>
        ))}
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </>
  );
}
