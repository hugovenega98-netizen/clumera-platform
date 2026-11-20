'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

async function put(url: string, body: unknown) {
  const res = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false as const, message: 'No hay conexión. Probá de nuevo.' };
  if (res.ok) return { ok: true as const, data: (await res.json()) as { knockoutReset?: boolean } };
  return { ok: false as const, message: ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? 'No se pudo guardar.' };
}

/** Inscribir un equipo (quien inscribe queda como capitán; la inscripción va a Pagos). */
export function RegisterTeamForm({ tournamentId, tournament, fee }: { tournamentId: string; tournament: string; fee: string | null }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const r = await postJson(`/api/m/tournaments/${tournamentId}/teams`, { name });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setName('');
    router.refresh();
  }
  return (
    <form className="cx-stack" onSubmit={submit} aria-label={`Inscribir equipo en ${tournament}`}>
      <Field label="Nombre del equipo" name="name" required minLength={3} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} hint={fee ? `Quedás como capitán. La inscripción (${fee}) se paga desde Pagos.` : 'Quedás como capitán.'} />
      <div>
        <Button type="submit" disabled={busy || name.trim().length < 3}>
          {busy ? 'Guardando…' : 'Inscribir equipo'}
        </Button>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </form>
  );
}

/** Acción de un paso: baja de equipo, sorteo, armar la eliminación. */
export function TournamentAction({ url, label, busyLabel, variant = 'primary', ariaLabel }: { url: string; label: string; busyLabel: string; variant?: 'primary' | 'secondary' | 'danger'; ariaLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true);
    setError('');
    const r = await postJson(url, {});
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <Button variant={variant} onClick={go} disabled={busy} aria-label={ariaLabel}>
        {busy ? busyLabel : label}
      </Button>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}

/**
 * Cargar o corregir un resultado. Una corrección oficial pide motivo; un empate en la eliminación pide
 * quién pasa (penales); si el deporte no admite empate, se avisa antes de mandar.
 */
export function ResultForm({ match, draws }: { match: { id: string; stage: string; home: string; away: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; status: string; winner: string | null }; draws: boolean }) {
  const router = useRouter();
  const played = match.status === 'played';
  const [open, setOpen] = useState(!played);
  const [home, setHome] = useState(match.homeScore?.toString() ?? '');
  const [away, setAway] = useState(match.awayScore?.toString() ?? '');
  const [winner, setWinner] = useState(match.winner === match.away ? match.awayTeamId : match.winner === match.home ? match.homeTeamId : '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const knockout = match.stage !== 'group';
  const tie = home !== '' && home === away;
  const valid = /^\d{1,3}$/.test(home) && /^\d{1,3}$/.test(away) && (!tie || (knockout ? Boolean(winner) : draws)) && (!played || reason.trim().length >= 5);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await put(`/api/m/tournaments/matches/${match.id}/result`, { homeScore: Number(home), awayScore: Number(away), winnerTeamId: knockout && tie ? winner : null, reason: played ? reason : undefined });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.message });
    setMsg({ tone: 'ok', text: r.data.knockoutReset ? 'Resultado corregido. La tabla cambió: volvé a armar la eliminación.' : played ? 'Resultado corregido. La tabla se recalculó.' : 'Resultado cargado. La tabla se actualizó.' });
    setReason('');
    setOpen(false);
    router.refresh();
  }
  if (!open)
    return (
      <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
        <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`Corregir ${match.home} contra ${match.away}`}>
          Corregir
        </Button>
        {msg ? (
          <p role="status" className={`callup-status callup-status--${msg.tone === 'ok' ? 'ok' : 'bad'}`}>
            {msg.text}
          </p>
        ) : null}
      </div>
    );
  return (
    <form className="tresult" onSubmit={submit} aria-label={`Resultado ${match.home} contra ${match.away}`}>
      <div className="tresult__scores">
        <Field label={match.home} name="home" inputMode="numeric" pattern="\d{1,3}" required value={home} onChange={(e) => setHome(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Goles de ${match.home}`} />
        <Field label={match.away} name="away" inputMode="numeric" pattern="\d{1,3}" required value={away} onChange={(e) => setAway(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label={`Goles de ${match.away}`} />
      </div>
      {tie && knockout ? (
        <fieldset className="tresult__winner">
          <legend className="cx-label">Empate: ¿quién pasa por penales?</legend>
          {[
            [match.homeTeamId, match.home],
            [match.awayTeamId, match.away],
          ].map(([id, name]) => (
            <label key={id} className="tresult__radio">
              <input type="radio" name={`winner-${match.id}`} value={id} checked={winner === id} onChange={() => setWinner(id!)} /> {name}
            </label>
          ))}
        </fieldset>
      ) : null}
      {tie && !knockout && !draws ? <Notice tone="bad">En este deporte no hay empate.</Notice> : null}
      {played ? <Field label="Motivo de la corrección" name="reason" required minLength={5} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} hint="Queda en el registro de auditoría." /> : null}
      <div className="adm-actions">
        <Button type="submit" disabled={busy || !valid}>
          {busy ? 'Guardando…' : played ? 'Guardar corrección' : 'Cargar resultado'}
        </Button>
        {played ? (
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Volver
          </Button>
        ) : null}
      </div>
      {msg ? (
        <p role="status" className={`callup-status callup-status--${msg.tone === 'ok' ? 'ok' : 'bad'}`}>
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}

/** Nuevo torneo relámpago (Organización). */
export function CreateTournamentForm({ sports, defaultDay }: { sports: Array<{ code: string; label: string }>; defaultDay: string }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', slug: '', sportCode: sports[0]?.code ?? '', maxTeams: '8', zones: '2', fee: '0', day: defaultDay, start: '14:00', minutes: '30', places: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const slug = f.slug || f.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const [h, m] = f.start.split(':').map(Number);
    const zones = Number(f.zones);
    const r = await postJson<{ slug: string }>('/api/m/tournaments', {
      name: f.name,
      slug,
      sportCode: f.sportCode,
      maxTeams: Number(f.maxTeams),
      zoneCount: zones,
      // 1 zona: final entre los 2 primeros; 2 zonas: semifinales cruzadas.
      qualifiersPerZone: 2,
      entryFee: Math.round(Number(f.fee.replace(/\./g, '').replace(',', '.')) * 100) || 0,
      playDay: f.day,
      firstMatchMinute: (h ?? 0) * 60 + (m ?? 0),
      matchMinutes: Number(f.minutes),
      places: f.places.split(',').map((p) => p.trim()).filter(Boolean),
    });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    router.push(`/admin/torneos/${r.data.slug}`);
  }
  return (
    <form className="cx-stack" onSubmit={submit} aria-label="Nuevo torneo">
      <div className="form-grid">
        <Field label="Nombre" name="name" required minLength={3} maxLength={80} value={f.name} onChange={set('name')} />
        <Field label="Dirección de la página" name="slug" value={slug} onChange={set('slug')} hint={`/torneos/${slug || '…'}`} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <div className="cx-field">
          <label className="cx-label" htmlFor="t-sport">
            Modalidad
          </label>
          <select id="t-sport" className="cx-input" value={f.sportCode} onChange={set('sportCode')}>
            {sports.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="cx-field">
          <label className="cx-label" htmlFor="t-zones">
            Formato
          </label>
          <select id="t-zones" className="cx-input" value={f.zones} onChange={set('zones')}>
            <option value="2">2 zonas → semifinales y final</option>
            <option value="1">1 zona → final entre los 2 primeros</option>
          </select>
        </div>
        <Field label="Cupo de equipos" name="maxTeams" type="number" min={2} max={64} value={f.maxTeams} onChange={set('maxTeams')} />
        <Field label="Inscripción por equipo ($)" name="fee" inputMode="decimal" value={f.fee} onChange={set('fee')} hint="0 si es gratis." />
        <Field label="Día de juego" name="day" type="date" required value={f.day} onChange={set('day')} />
        <Field label="Primer partido" name="start" type="time" required value={f.start} onChange={set('start')} />
        <Field label="Minutos por partido" name="minutes" type="number" min={10} max={240} value={f.minutes} onChange={set('minutes')} />
        <Field label="Canchas" name="places" required value={f.places} onChange={set('places')} hint="Separadas por coma, por ejemplo: F5-1, F5-2" />
      </div>
      <div>
        <Button type="submit" disabled={busy || f.name.trim().length < 3 || !f.places.trim()}>
          {busy ? 'Guardando…' : 'Crear torneo'}
        </Button>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </form>
  );
}
