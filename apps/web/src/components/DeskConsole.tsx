'use client';

import { Button, Notice } from '@clumera/ui';
import { useState } from 'react';
import { postJson } from './forms';
import { PHASE, Scoreboard, Timeline, type LiveData } from './LiveBoard';

interface Props {
  initial: LiveData;
  events: Array<{ id: string; label: string; points: number }>;
  players: Array<{ personId: string; name: string }>;
  usesClock: boolean;
  family: string;
  periodCount: number;
}

const CLOCK_NEXT: Record<string, Array<{ action: string; label: string }>> = {
  not_started: [{ action: 'start_first_half', label: 'Iniciar' }],
  first_half: [{ action: 'half_time', label: 'Entretiempo' }],
  halftime: [{ action: 'start_second_half', label: 'Iniciar 2.º tiempo' }],
  second_half: [{ action: 'finish_clock', label: 'Terminar reloj' }],
  quarter_1: [{ action: 'half_time', label: 'Fin del cuarto' }],
  quarter_2: [{ action: 'half_time', label: 'Fin del cuarto' }],
  quarter_3: [{ action: 'half_time', label: 'Fin del cuarto' }],
  quarter_4: [{ action: 'finish_clock', label: 'Terminar reloj' }],
  break_1: [{ action: 'start_second_half', label: 'Iniciar 2.º cuarto' }],
  break_2: [{ action: 'start_second_half', label: 'Iniciar 3.er cuarto' }],
  break_3: [{ action: 'start_second_half', label: 'Iniciar 4.º cuarto' }],
};

/**
 * Mesa de control: reloj, incidencias por equipo y deshacer. Cada carga va al servidor, que valida
 * el deporte, el estado del partido y la formación; la pantalla se refresca con la respuesta.
 */
export function DeskConsole({ initial, events, players, usesClock, family }: Props) {
  const [data, setData] = useState(initial);
  const [side, setSide] = useState<'own' | 'opponent'>('own');
  const [player, setPlayer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const id = initial.id;

  async function refresh() {
    const res = await fetch(`/api/sports/matches/${id}/live`, { cache: 'no-store' }).catch(() => null);
    if (res?.ok) setData(await res.json());
  }
  async function act(url: string, body: unknown = {}) {
    setBusy(true);
    setError('');
    const r = await postJson(url, body);
    setBusy(false);
    if (!r.ok) setError(r.error.message);
    await refresh();
  }
  async function undo() {
    const last = data.events[0];
    if (!last) return;
    setBusy(true);
    const res = await fetch(`/api/sports/events/${last.id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) setError('No se pudo deshacer.');
    await refresh();
  }

  const phase = data.clock?.phase ?? 'not_started';
  const live = data.status === 'live';
  const canRecord = live && (!usesClock || (phase !== 'not_started' && phase !== 'finished'));
  const running = data.clock?.running ?? false;

  return (
    <div className="desk">
      <Scoreboard data={data} />
      {error ? <Notice tone="bad">{error}</Notice> : null}

      {data.status === 'scheduled' ? (
        <Button block onClick={() => act(`/api/sports/matches/${id}/start`)} disabled={busy}>
          Iniciar partido
        </Button>
      ) : null}

      {live && usesClock ? (
        <section className="cx-card" aria-label="Reloj">
          <h2 className="cx-card__title">Reloj · {PHASE[phase] ?? phase}</h2>
          <div className="adm-actions">
            {(CLOCK_NEXT[phase] ?? []).map((a) => (
              <Button key={a.action} onClick={() => act(`/api/sports/matches/${id}/clock`, { action: a.action })} disabled={busy}>
                {a.label}
              </Button>
            ))}
            {phase !== 'not_started' && phase !== 'finished' && !['halftime', 'break_1', 'break_2', 'break_3'].includes(phase) ? (
              <Button variant="secondary" onClick={() => act(`/api/sports/matches/${id}/clock`, { action: running ? 'pause' : 'resume' })} disabled={busy}>
                {running ? 'Pausar' : 'Reanudar'}
              </Button>
            ) : null}
            {family === 'football' && running ? (
              <Button variant="secondary" onClick={() => act(`/api/sports/matches/${id}/clock`, { action: 'add_time' })} disabled={busy}>
                +1&apos; adicional
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {live ? (
        <section className="cx-card" aria-label="Cargar incidencia">
          <div className="seg" role="radiogroup" aria-label="Equipo">
            <button type="button" role="radio" aria-checked={side === 'own'} onClick={() => setSide('own')}>
              {data.teamName}
            </button>
            <button type="button" role="radio" aria-checked={side === 'opponent'} onClick={() => setSide('opponent')}>
              {data.opponent}
            </button>
          </div>
          {side === 'own' && players.length ? (
            <div className="cx-field">
              <label className="cx-label" htmlFor="desk-player">
                Jugador
              </label>
              <select id="desk-player" className="cx-select" value={player} onChange={(e) => setPlayer(e.target.value)}>
                <option value="">Sin indicar</option>
                {players.map((p) => (
                  <option key={p.personId} value={p.personId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="desk__events">
            {events.map((ev) => (
              <button
                key={ev.id}
                type="button"
                className="desk__event"
                disabled={!canRecord || busy}
                onClick={() => act(`/api/sports/matches/${id}/events`, { type: ev.id, side, personId: side === 'own' && player ? player : null })}
              >
                {ev.label}
                {ev.points ? <span className="cx-muted"> +{ev.points}</span> : null}
              </button>
            ))}
          </div>
          {!canRecord && usesClock ? <p className="cx-muted">{phase === 'not_started' ? 'Iniciá el reloj para cargar incidencias.' : 'El reloj está terminado.'}</p> : null}
          <div className="adm-actions">
            <Button variant="secondary" onClick={undo} disabled={busy || !data.events.length}>
              Deshacer última
            </Button>
            <Button variant="danger" onClick={() => act(`/api/sports/matches/${id}/finish`)} disabled={busy || (usesClock && phase !== 'finished' && phase !== 'not_started')}>
              Final del partido
            </Button>
          </div>
        </section>
      ) : null}

      {data.status === 'pending_close' ? <Notice tone="ok">Final cargado. El coach confirma el resultado oficial.</Notice> : null}

      <section className="cx-card" aria-label="Incidencias cargadas">
        <h2 className="cx-card__title">Cargado</h2>
        <Timeline data={data} />
      </section>
    </div>
  );
}
