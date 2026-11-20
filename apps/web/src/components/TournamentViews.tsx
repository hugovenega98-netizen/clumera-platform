import type { TournamentView } from '@clumera/module-tournaments';
import { STAGE_LABEL } from '@clumera/module-tournaments';
import type { ReactNode } from 'react';

const timeFmt = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });
const dayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
export const playDayLabel = (day: string) => dayFmt.format(new Date(`${day}T12:00:00Z`));
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w.charAt(0)))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || name.slice(0, 2).toUpperCase();

type Match = TournamentView['matches'][number];

/** Partido del fixture: hora, equipos, resultado y cancha. `action` agrega la carga de resultado (Organización). */
export function MatchRow({ m, action }: { m: Match; action?: ReactNode }) {
  const played = m.status === 'played';
  const label = `${m.home} ${played ? `${m.homeScore} a ${m.awayScore}` : 'contra'} ${m.away}`;
  return (
    <li className="tmatch" aria-label={label}>
      <span className="tmatch__time">{timeFmt.format(m.startsAt)}</span>
      <b className={`tmatch__team tmatch__team--home${m.winner === m.home ? ' is-winner' : ''}`}>{m.home}</b>
      <span className="tmatch__score" aria-hidden="true">
        {played ? `${m.homeScore} – ${m.awayScore}` : 'vs'}
      </span>
      <b className={`tmatch__team${m.winner === m.away ? ' is-winner' : ''}`}>{m.away}</b>
      <span className="tmatch__meta cx-muted">
        {m.place}
        {m.stage === 'group' ? ` · Zona ${m.zone}` : ` · ${STAGE_LABEL[m.stage]}`}
        {played && m.homeScore === m.awayScore && m.stage !== 'group' ? ` · pasa ${m.winner} por penales` : ''}
      </span>
      <span className={`cx-tag ${played ? '' : 'cx-tag--info'}`}>{played ? (m.version > 1 ? 'Corregido' : 'Final') : 'Programado'}</span>
      {action ? <div className="tmatch__action">{action}</div> : null}
    </li>
  );
}

/** Tabla de posiciones de cada zona, calculada (nunca guardada): resaltados los que clasifican. */
export function ZoneTables({ view, compact = false }: { view: TournamentView; compact?: boolean }) {
  if (!view.tables.length) return null;
  const q = view.tournament.qualifiersPerZone;
  return (
    <div className="tzones">
      {view.tables.map((z) => (
        <section key={z.zone} className="cx-card tzone" aria-label={`Posiciones · Zona ${z.zone}`}>
          <h2 className="cx-card__title" style={{ margin: 0 }}>
            Zona {z.zone}
          </h2>
          <div className="ttable-wrap">
            <table className="ttable">
              <thead>
                <tr>
                  <th scope="col">Equipo</th>
                  <th scope="col" className="n">
                    <abbr title="Partidos jugados">PJ</abbr>
                  </th>
                  {compact ? null : (
                    <>
                      <th scope="col" className="n">
                        <abbr title="Ganados">G</abbr>
                      </th>
                      {view.rule.draws ? (
                        <th scope="col" className="n">
                          <abbr title="Empatados">E</abbr>
                        </th>
                      ) : null}
                      <th scope="col" className="n">
                        <abbr title="Perdidos">P</abbr>
                      </th>
                    </>
                  )}
                  <th scope="col" className="n">
                    <abbr title="Diferencia">DG</abbr>
                  </th>
                  <th scope="col" className="n">
                    Pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {z.rows.map((r, i) => (
                  <tr key={r.teamId} className={i < q ? 'is-qualified' : undefined}>
                    <th scope="row">
                      {i + 1}. {r.name}
                    </th>
                    <td className="n">{r.played}</td>
                    {compact ? null : (
                      <>
                        <td className="n">{r.won}</td>
                        {view.rule.draws ? <td className="n">{r.drawn}</td> : null}
                        <td className="n">{r.lost}</td>
                      </>
                    )}
                    <td className="n">{signed(r.diff)}</td>
                    <td className="n">
                      <b>{r.points}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cx-muted" style={{ margin: 0, fontSize: 13 }}>
            Clasifican {q === 1 ? 'el primero' : `los ${q} primeros`} (marcados). Desempate: diferencia, goles a favor y partido entre ellos.
          </p>
        </section>
      ))}
    </div>
  );
}

/** Llave de eliminación y podio. */
export function Bracket({ view, action }: { view: TournamentView; action?: (m: Match) => ReactNode }) {
  const ko = view.matches.filter((m) => m.stage !== 'group');
  if (!ko.length && !view.podium) return null;
  return (
    <section className="cx-card" aria-label="Eliminación">
      <h2 className="cx-card__title" style={{ margin: 0 }}>
        Eliminación
      </h2>
      {view.podium ? (
        <div className="tpodium" role="status">
          <span className="tpodium__crest" aria-hidden="true">
            {initials(view.podium.champion)}
          </span>
          <span>
            <span className="cx-muted">Campeón</span>
            <strong>{view.podium.champion}</strong>
            <span className="cx-muted">
              Subcampeón: {view.podium.runnerUp}
              {view.podium.third ? ` · Tercero: ${view.podium.third}` : ''}
            </span>
          </span>
        </div>
      ) : null}
      <ul className="tmatches">
        {ko.map((m) => (
          <MatchRow key={m.id} m={m} action={action?.(m)} />
        ))}
      </ul>
      {ko.some((m) => m.stage === 'semi') && !ko.some((m) => m.stage === 'final') ? <p className="cx-muted">La final y el tercer puesto se arman solos cuando terminan las dos semifinales.</p> : null}
    </section>
  );
}

/** Fixture de la fase de grupos, agrupado por horario. */
export function GroupFixture({ view, action }: { view: TournamentView; action?: (m: Match) => ReactNode }) {
  const group = view.matches.filter((m) => m.stage === 'group');
  if (!group.length) return null;
  const played = group.filter((m) => m.status === 'played').length;
  return (
    <section className="cx-card" aria-label="Fixture">
      <div className="tsec-head">
        <h2 className="cx-card__title" style={{ margin: 0 }}>
          Fase de grupos
        </h2>
        <span className="cx-muted">
          {playDayLabel(view.tournament.playDay)} · {played} de {group.length} jugados
        </span>
      </div>
      <ul className="tmatches">
        {group.map((m) => (
          <MatchRow key={m.id} m={m} action={action?.(m)} />
        ))}
      </ul>
    </section>
  );
}

export { initials as teamInitials };
