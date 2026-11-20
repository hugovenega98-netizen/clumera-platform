import { STATUS_LABEL, tournamentView } from '@clumera/module-tournaments';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PublicShell } from '@/components/PublicShell';
import { Bracket, GroupFixture, MatchRow, playDayLabel, teamInitials, ZoneTables } from '@/components/TournamentViews';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const dynamic = 'force-dynamic';
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const v = await tournamentView(getPrisma(), (await params).slug).catch(() => null);
  return { title: v?.tournament.publicPage ? v.tournament.name : 'Torneo' };
}

/**
 * Página pública del torneo (lienzo «Página pública del torneo»): sin sesión. Muestra equipos,
 * próximos partidos, posiciones por zona y la llave. Ningún dato de personas: ni capitanes ni pagos.
 */
export default async function PublicTournamentPage({ params }: { params: Params }) {
  await requireModulePage('tournaments');
  const view = await tournamentView(getPrisma(), (await params).slug);
  if (!view || !view.tournament.publicPage) notFound();
  const t = view.tournament;
  const next = view.matches.filter((m) => m.status !== 'played').slice(0, 4);
  const last = view.matches.filter((m) => m.status === 'played').at(-1);
  return (
    <PublicShell next="/torneos">
      <section className="thero" aria-label={t.name}>
        <span className="thero__kicker">{t.sportLabel} · torneo relámpago</span>
        <h1>{t.name}</h1>
        <span>
          {playDayLabel(t.playDay)} · {view.teams.length} equipos · {t.places.join(', ')}
        </span>
        <span className="cx-tag cx-tag--info" style={{ alignSelf: 'flex-start' }}>
          {STATUS_LABEL[t.status]}
        </span>
      </section>
      {view.podium ? <Bracket view={view} /> : null}
      {last && !view.podium ? (
        <section className="cx-card tlast" aria-label="Último resultado">
          <span className="cx-muted">Último resultado · {last.place}</span>
          <div className="tlast__score">
            <span>
              <span className="tpodium__crest" aria-hidden="true">
                {teamInitials(last.home)}
              </span>
              <b>{last.home}</b>
            </span>
            <strong>
              {last.homeScore} – {last.awayScore}
            </strong>
            <span>
              <span className="tpodium__crest" aria-hidden="true">
                {teamInitials(last.away)}
              </span>
              <b>{last.away}</b>
            </span>
          </div>
        </section>
      ) : null}
      <div className="tgrid">
        {next.length ? (
          <section className="cx-card" aria-label="Próximos partidos">
            <h2 className="cx-card__title" style={{ margin: 0 }}>
              Próximos partidos
            </h2>
            <ul className="tmatches">
              {next.map((m) => (
                <MatchRow key={m.id} m={m} />
              ))}
            </ul>
          </section>
        ) : null}
        {t.status === 'registration' ? (
          <section className="cx-card" aria-label="Equipos inscriptos">
            <h2 className="cx-card__title" style={{ margin: 0 }}>
              Equipos inscriptos
            </h2>
            <p className="cx-muted" style={{ margin: 0 }}>
              {view.teams.length} de {t.maxTeams}. El fixture se publica con el sorteo.
            </p>
            <ul className="tteams">
              {view.teams.map((team) => (
                <li key={team.id}>{team.name}</li>
              ))}
            </ul>
            <Link className="cx-link" href="/torneos">
              Inscribir un equipo
            </Link>
          </section>
        ) : null}
      </div>
      <ZoneTables view={view} compact />
      {view.podium ? null : <Bracket view={view} />}
      <GroupFixture view={view} />
    </PublicShell>
  );
}
