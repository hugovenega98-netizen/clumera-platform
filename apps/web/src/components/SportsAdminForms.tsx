'use client';

import { parseMoney } from '@clumera/finance/money';
import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

function useSubmit(url: string, build: (f: FormData) => unknown | string, done: string) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = build(new FormData(form));
    if (typeof body === 'string') return setMsg({ tone: 'bad', text: body });
    const r = await postJson<{ issued?: number; skipped?: number }>(url, body);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: typeof r.data.issued === 'number' ? `Emitidos ${r.data.issued} aranceles${r.data.skipped ? ` (${r.data.skipped} ya estaban)` : ''}.` : done });
    form.reset();
    router.refresh();
  }
  return { msg, submit };
}

export function NewSportForm({ catalog }: { catalog: Array<{ code: string; label: string }> }) {
  const [slug, setSlug] = useState('');
  const { msg, submit } = useSubmit('/api/sports/sports', (f) => ({ code: f.get('code'), name: f.get('name'), slug: f.get('slug') }), 'Deporte creado.');
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nuevo deporte">
      <div className="cx-field">
        <label className="cx-label" htmlFor="sport-code">
          Modalidad
        </label>
        <select id="sport-code" name="code" className="cx-select" required>
          {catalog.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <Field label="Nombre en el club" name="name" required maxLength={60} onChange={(e) => setSlug(slugify(e.target.value))} />
      <Field label="Identificador" name="slug" required value={slug} onChange={(e) => setSlug(e.target.value)} hint="Para los roles con alcance (por ejemplo rugby)." className="span-2" />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Crear deporte
          </Button>
        </div>
      </div>
    </form>
  );
}

export function NewTeamForm({ sports }: { sports: Array<{ id: string; name: string; slug: string }> }) {
  const [sportId, setSportId] = useState(sports[0]?.id ?? '');
  const [slug, setSlug] = useState('');
  const sport = sports.find((s) => s.id === sportId);
  const { msg, submit } = useSubmit(
    '/api/sports/teams',
    (f) => {
      const fee = String(f.get('fee') ?? '').trim();
      const cents = fee ? parseMoney(fee) : null;
      if (fee && !cents) return 'Arancel inválido. Escribilo como 18.500.';
      return { sportId, name: f.get('name'), slug: f.get('slug'), monthlyFee: cents };
    },
    'Equipo creado.',
  );
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nuevo equipo">
      <div className="cx-field">
        <label className="cx-label" htmlFor="team-sport">
          Deporte
        </label>
        <select id="team-sport" className="cx-select" value={sportId} onChange={(e) => setSportId(e.target.value)}>
          {sports.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <Field label="Equipo o categoría" name="name" required maxLength={60} onChange={(e) => setSlug(slugify(`${sport?.slug ?? ''}-${e.target.value}`))} />
      <Field label="Identificador" name="slug" required value={slug} onChange={(e) => setSlug(e.target.value)} hint="Ámbito del coach y la mesa (por ejemplo rugby-m19)." />
      <Field label="Arancel mensual" name="fee" inputMode="decimal" placeholder="Sin arancel" hint="Se emite como cargo en Finanzas." />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Crear equipo
          </Button>
        </div>
      </div>
    </form>
  );
}

export function TeamFeesForm({ period }: { period: string }) {
  const { msg, submit } = useSubmit('/api/sports/fees', (f) => ({ period: f.get('period'), dueDay: Number(f.get('dueDay')) }), '');
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Emitir aranceles">
      <Field label="Período" name="period" type="month" defaultValue={period} required />
      <Field label="Día de vencimiento" name="dueDay" type="number" min={1} max={28} defaultValue={10} required />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
          Un cargo por jugador de cada equipo con arancel; en la cuenta aparece separado por deporte y equipo. Volver a emitir no duplica.
        </p>
        <div>
          <Button type="submit">Emitir aranceles</Button>
        </div>
      </div>
    </form>
  );
}

/** Sumar o quitar a alguien del plantel. */
export function MemberToggle({ teamId, personId, active, label }: { teamId: string; personId: string; active: boolean; label: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <>
      <Button
        variant={active ? 'secondary' : 'primary'}
        className={active ? 'btn-danger' : undefined}
        aria-label={`${active ? 'Quitar del plantel' : 'Sumar al plantel'}: ${label}`}
        onClick={async () => {
          const r = await postJson(`/api/sports/teams/${teamId}/members`, { personId, active: !active });
          if (!r.ok) return setError(r.error.message);
          router.refresh();
        }}
      >
        {active ? 'Quitar' : 'Sumar'}
      </Button>
      {error ? <span className="cx-error">{error}</span> : null}
    </>
  );
}
