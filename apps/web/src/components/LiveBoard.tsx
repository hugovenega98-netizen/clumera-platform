'use client';

import { useEffect, useState } from 'react';

export interface LiveData {
  id: string;
  sportCode: string;
  sportName: string;
  teamName: string;
  opponent: string;
  home: boolean;
  venue: string;
  status: string;
  score: { own: number; opponent: number };
  clock: { phase: string; running: boolean; elapsedSeconds: number; minute: number | null; addedMinutes: number; snapshotAt: string } | null;
  volley: { sets: Array<{ number: number; own: number; opponent: number; winner: string | null }>; ownSets: number; opponentSets: number } | null;
  softball: { inning: number; half: 'top' | 'bottom'; outs: number; own: number; opponent: number } | null;
  events: Array<{ id: string; side: 'own' | 'opponent'; type: string; label: string; minute: number | null; setNumber: number | null; points: number; player: string }>;
}

export const PHASE: Record<string, string> = {
  not_started: 'Sin iniciar',
  first_half: '1.er tiempo',
  halftime: 'Entretiempo',
  second_half: '2.º tiempo',
  finished: 'Final',
  quarter_1: '1.er cuarto',
  quarter_2: '2.º cuarto',
  quarter_3: '3.er cuarto',
  quarter_4: '4.º cuarto',
  break_1: 'Descanso',
  break_2: 'Entretiempo',
  break_3: 'Descanso',
};
const STATUS: Record<string, string> = { scheduled: 'Programado', live: 'En juego', pending_close: 'Final', played: 'Final', cancelled: 'Suspendido' };

/** Reloj que avanza en la pantalla a partir de la última foto del servidor. */
export function useClockSeconds(clock: LiveData['clock']): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!clock?.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [clock?.running]);
  if (!clock) return 0;
  return clock.elapsedSeconds + (clock.running ? Math.max(0, Math.floor((now - new Date(clock.snapshotAt).getTime()) / 1000)) : 0);
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

export function Scoreboard({ data }: { data: LiveData }) {
  const secs = useClockSeconds(data.clock);
  const left = data.home ? { name: data.teamName, score: data.score.own } : { name: data.opponent, score: data.score.opponent };
  const right = data.home ? { name: data.opponent, score: data.score.opponent } : { name: data.teamName, score: data.score.own };
  return (
    <section className="scoreboard" aria-label="Marcador">
      <div className="scoreboard__meta">
        <span className={`cx-tag ${data.status === 'live' ? 'cx-tag--bad' : ''}`}>{data.status === 'live' ? '● En juego' : STATUS[data.status]}</span>
        <span>{data.sportName}</span>
      </div>
      <div className="scoreboard__row">
        <span className="scoreboard__team">{left.name}</span>
        <span className="scoreboard__score" aria-label={`${left.name} ${left.score}, ${right.name} ${right.score}`}>
          {left.score} – {right.score}
        </span>
        <span className="scoreboard__team">{right.name}</span>
      </div>
      {data.clock && data.status === 'live' ? (
        <div className="scoreboard__clock" aria-live="off">
          {PHASE[data.clock.phase] ?? data.clock.phase}
          {data.clock.phase !== 'not_started' && data.clock.phase !== 'finished' ? ` · ${mmss(secs)}` : ''}
          {data.clock.addedMinutes ? ` · +${data.clock.addedMinutes}'` : ''}
        </div>
      ) : null}
      {data.volley ? (
        <div className="scoreboard__clock">
          Sets {data.volley.ownSets}–{data.volley.opponentSets} · {data.volley.sets.map((s) => `${s.own}-${s.opponent}`).join(' · ')}
        </div>
      ) : null}
      {data.softball ? (
        <div className="scoreboard__clock">
          Entrada {data.softball.inning} · {data.softball.half === 'top' ? 'alta' : 'baja'} · {data.softball.outs} {data.softball.outs === 1 ? 'out' : 'outs'}
        </div>
      ) : null}
    </section>
  );
}

export function Timeline({ data }: { data: LiveData }) {
  if (!data.events.length) return <p className="cx-muted">Todavía no hay incidencias.</p>;
  return (
    <ol className="timeline" aria-label="Minuto a minuto">
      {data.events.map((e) => (
        <li key={e.id} className={e.side === 'opponent' ? 'timeline__item timeline__item--rival' : 'timeline__item'}>
          <span className="timeline__min">{e.minute != null ? `${e.minute}'` : e.setNumber != null ? `S${e.setNumber}` : '·'}</span>
          <span className="grow">
            <strong>{e.label}</strong> · {e.side === 'opponent' ? data.opponent : data.teamName}
            {e.player ? <span className="cx-muted"> · {e.player}</span> : null}
          </span>
          {e.points ? <span className="cx-tag">+{e.points}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** Minuto a minuto que se actualiza solo (cada 10 s; al instante cuando la pestaña vuelve). */
export function LiveBoard({ initial }: { initial: LiveData }) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const res = await fetch(`/api/sports/matches/${initial.id}/live`, { cache: 'no-store' }).catch(() => null);
      if (!stop && res?.ok) setData(await res.json());
    };
    const t = setInterval(tick, 10_000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [initial.id]);
  return (
    <div className="cx-stack">
      <Scoreboard data={data} />
      <section className="cx-card" aria-label="Incidencias">
        <h2 className="cx-card__title">Minuto a minuto</h2>
        <Timeline data={data} />
      </section>
    </div>
  );
}
