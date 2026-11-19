'use client';

import { Button, Notice } from '@clumera/ui';
import { useMemo, useState } from 'react';
import { formatMoney as money } from '@clumera/finance/money';
import { postJson } from './forms';

export interface PayableCharge {
  id: string;
  description: string;
  detail: string;
  outstanding: number;
  label: string;
  overdue: boolean;
}

/**
 * Selección de cargos a pagar online. Cada concepto se cancela por separado; el servicio se
 * confirma cuando el pago se acredita (webhook), no al volver de la pasarela.
 */
export function PaySelection({ groups, online }: { groups: Array<{ title: string; charges: PayableCharge[] }>; online: boolean }) {
  const all = useMemo(() => groups.flatMap((g) => g.charges), [groups]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(all.filter((c) => c.overdue).map((c) => c.id)));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = all.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.outstanding, 0);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function pay() {
    setBusy(true);
    setError('');
    const r = await postJson<{ checkoutUrl: string }>('/api/finance/checkout', { chargeIds: [...selected] });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error.message);
    }
    window.location.assign(r.data.checkoutUrl);
  }

  return (
    <div className="cx-stack">
      {groups.map((g) => (
        <section key={g.title} className="cx-card pay-group" aria-label={g.title}>
          <h2 className="cx-card__title">{g.title}</h2>
          {g.charges.map((c) => (
            <label key={c.id} className="pay-item">
              {online ? <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Pagar ${c.description}`} /> : null}
              <span className="grow">
                <span className="pay-item__title">{c.description}</span>
                <span className="cx-muted">{c.detail}</span>
              </span>
              <span className="pay-item__amount">{c.label}</span>
            </label>
          ))}
        </section>
      ))}
      {online ? (
        <div className="pay-bar">
          {error ? <Notice tone="bad">{error}</Notice> : null}
          <Button block onClick={pay} disabled={busy || total === 0}>
            {total ? `Pagar seleccionados · ${money(total)}` : 'Elegí qué pagar'}
          </Button>
          <span className="cx-muted">Pagás con Mercado Pago. Cada concepto se cancela por separado y se confirma al acreditarse.</span>
        </div>
      ) : (
        <p className="cx-muted">Por ahora se paga en la secretaría o la caja del club. El pago online se habilita pronto.</p>
      )}
    </div>
  );
}
