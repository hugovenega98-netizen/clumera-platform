'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

async function send(method: 'POST' | 'DELETE', url: string, body?: unknown): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown> }> {
  if (method === 'POST') {
    const r = await postJson(url, body ?? {});
    return r.ok ? { ok: true, data: r.data } : { ok: false, message: r.error.message };
  }
  const res = await fetch(url, { method }).catch(() => null);
  if (!res) return { ok: false, message: 'No hay conexión.' };
  if (res.ok) return { ok: true };
  return { ok: false, message: ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? 'No se pudo.' };
}

/** Lo que queda escrito bajo los botones, según la respuesta guardada. */
const CALLUP_STATUS: Record<string, { text: string; tone: string }> = {
  going: { text: 'Confirmaste que vas. El coach ya lo ve en el plantel.', tone: 'callup-status--ok' },
  not_going: { text: 'Avisaste que no podés. El coach ya lo ve y quedás fuera de la formación.', tone: 'callup-status--bad' },
  pending: { text: 'Todavía no respondiste: el coach espera tu confirmación.', tone: 'callup-status--warn' },
};

/**
 * «Voy» / «No puedo» para una convocatoria (la persona o su responsable). Mientras guarda, los botones
 * se desactivan y dicen «Guardando…»; después queda escrita la respuesta. Se puede cambiar hasta que
 * empieza el partido.
 */
export function CallupButtons({ matchId, personId, response, who }: { matchId: string; personId: string; response: string; who?: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [current, setCurrent] = useState(response);
  const [saving, setSaving] = useState<'going' | 'not_going' | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  async function answer(r: 'going' | 'not_going') {
    if (saving) return;
    setError('');
    setJustSaved(false);
    setSaving(r);
    const res = await send('POST', `/api/sports/matches/${matchId}/callup`, { personId, response: r });
    setSaving(null);
    if (!res.ok) return setError(res.message || 'No se pudo guardar la respuesta. Probá de nuevo.');
    setCurrent(r);
    setJustSaved(true);
    router.refresh();
  }
  const status = CALLUP_STATUS[current] ?? CALLUP_STATUS.pending!;
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <div className="adm-actions" role="group" aria-label={`Convocatoria${who ? ` de ${who}` : ''}`} aria-busy={saving !== null}>
        <Button variant={current === 'going' ? 'primary' : 'secondary'} aria-pressed={current === 'going'} disabled={saving !== null} onClick={() => answer('going')}>
          {saving === 'going' ? 'Guardando…' : <>{current === 'going' ? <span aria-hidden="true">✓ </span> : null}Voy</>}
        </Button>
        <Button variant={current === 'not_going' ? 'primary' : 'secondary'} aria-pressed={current === 'not_going'} disabled={saving !== null} onClick={() => answer('not_going')}>
          {saving === 'not_going' ? 'Guardando…' : <>{current === 'not_going' ? <span aria-hidden="true">✓ </span> : null}No puedo</>}
        </Button>
      </div>
      {/* role="status": el lector de pantalla anuncia la respuesta guardada. */}
      <p className={`callup-status ${status.tone}`} role="status">
        {justSaved ? 'Listo. ' : ''}
        {status.text}
      </p>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}

/** Avisar una ausencia para una fecha. */
export function AbsenceForm({ personId, teamId }: { personId: string; teamId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await send('POST', '/api/sports/absences', { personId, teamId, date: f.get('date'), reason: f.get('reason') });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.message ?? '' });
    setMsg({ tone: 'ok', text: 'Ausencia avisada. Si había partido ese día, la convocatoria quedó en «No puedo».' });
    e.currentTarget?.reset();
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Avisar ausencia">
      <Field label="Fecha" name="date" type="date" required />
      <Field label="Motivo" name="reason" required minLength={3} maxLength={200} placeholder="Viaje, examen…" />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Avisar ausencia
          </Button>
        </div>
      </div>
    </form>
  );
}

export function CancelAbsence({ absenceId }: { absenceId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="cx-link-button"
      onClick={async () => {
        if ((await send('DELETE', `/api/sports/absences/${absenceId}`)).ok) router.refresh();
      }}
    >
      Anular
    </button>
  );
}

/** Programar un partido (coach). */
export function NewMatchForm({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const local = String(f.get('startsAt') ?? '');
    if (!local) return setError('Indicá fecha y hora');
    const r = await send('POST', '/api/sports/matches', { teamId, opponent: f.get('opponent'), startsAt: new Date(local).toISOString(), home: f.get('home') === 'home', venue: f.get('venue') || undefined });
    if (!r.ok) return setError(r.message ?? '');
    router.push(`/deportes/partidos/${String(r.data?.id)}`);
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nuevo partido">
      <Field label="Rival" name="opponent" required maxLength={100} />
      <Field label="Fecha y hora" name="startsAt" type="datetime-local" required />
      <div className="cx-field">
        <label className="cx-label" htmlFor="home">
          Condición
        </label>
        <select id="home" name="home" className="cx-select" defaultValue="home">
          <option value="home">Local</option>
          <option value="away">Visitante</option>
        </select>
      </div>
      <Field label="Lugar" name="venue" maxLength={100} placeholder="Cancha 1" />
      <div className="span-2 cx-stack">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <div>
          <Button type="submit">Programar y convocar</Button>
        </div>
      </div>
    </form>
  );
}

/** Formación del partido: elegir entre los convocados que no avisaron que no van. */
export function LineupForm({ matchId, players, locked }: { matchId: string; players: Array<{ personId: string; name: string; response: string; inLineup: boolean }>; locked: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState(() => new Set(players.filter((p) => p.inLineup).map((p) => p.personId)));
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const RESP: Record<string, string> = { going: 'Va', not_going: 'No va', pending: 'Sin responder' };
  async function save() {
    const r = await send('POST', `/api/sports/matches/${matchId}/lineup`, { personIds: [...selected] });
    setMsg(r.ok ? { tone: 'ok', text: `Formación guardada: ${selected.size} ${selected.size === 1 ? 'jugador' : 'jugadores'}.` } : { tone: 'bad', text: r.message ?? '' });
    if (r.ok) router.refresh();
  }
  return (
    <div className="cx-stack">
      <div className="rows" role="group" aria-label="Convocados">
        {players.map((p) => (
          <label key={p.personId} style={{ cursor: locked || p.response === 'not_going' ? 'default' : 'pointer' }}>
            <input
              type="checkbox"
              disabled={locked || p.response === 'not_going'}
              checked={selected.has(p.personId)}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(p.personId)) n.delete(p.personId);
                  else n.add(p.personId);
                  return n;
                })
              }
              aria-label={`En la formación: ${p.name}`}
              style={{ width: 22, height: 22, accentColor: 'var(--cx-button)' }}
            />
            <span className="grow">{p.name}</span>
            <span className={`cx-tag ${p.response === 'going' ? 'cx-tag--ok' : p.response === 'not_going' ? 'cx-tag--bad' : ''}`}>{RESP[p.response]}</span>
          </label>
        ))}
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      {!locked ? (
        <div>
          <Button onClick={save}>Guardar formación</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Acciones del coach sobre el partido: iniciar, publicar el minuto a minuto, cerrar. */
export function CoachMatchActions({ matchId, status, mamPublic, scoreFor, scoreAgainst }: { matchId: string; status: string; mamPublic: boolean; scoreFor: number | null; scoreAgainst: number | null }) {
  const router = useRouter();
  const [error, setError] = useState('');
  async function run(url: string, body?: unknown) {
    setError('');
    const r = await send('POST', url, body);
    if (!r.ok) return setError(r.message ?? '');
    router.refresh();
  }
  async function close(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(`/api/sports/matches/${matchId}/close`, { status: 'played', scoreFor: Number(f.get('scoreFor')), scoreAgainst: Number(f.get('scoreAgainst')) });
  }
  const locked = status === 'played' || status === 'cancelled';
  return (
    <div className="cx-stack">
      <div className="adm-actions">
        {status === 'scheduled' ? <Button onClick={() => run(`/api/sports/matches/${matchId}/start`)}>Iniciar partido</Button> : null}
        {!locked ? (
          <Button variant="secondary" onClick={() => run(`/api/sports/matches/${matchId}/public`, { mamPublic: !mamPublic })} aria-pressed={mamPublic}>
            {mamPublic ? 'Minuto a minuto: público' : 'Publicar minuto a minuto'}
          </Button>
        ) : null}
        {status === 'scheduled' ? (
          <Button variant="secondary" className="btn-danger" onClick={() => run(`/api/sports/matches/${matchId}/close`, { status: 'cancelled' })}>
            Suspender
          </Button>
        ) : null}
      </div>
      {status === 'live' || status === 'pending_close' ? (
        <form className="form-grid" onSubmit={close} aria-label="Cerrar partido">
          <Field label="Puntos a favor" name="scoreFor" type="number" min={0} max={999} required defaultValue={scoreFor ?? 0} />
          <Field label="Puntos en contra" name="scoreAgainst" type="number" min={0} max={999} required defaultValue={scoreAgainst ?? 0} />
          <div className="span-2">
            <Button type="submit">Cerrar como jugado</Button>
          </div>
        </form>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}
