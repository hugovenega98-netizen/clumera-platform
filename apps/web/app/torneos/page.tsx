import { formatMoney } from '@clumera/finance';
import { captainTeams, listTournaments, STATUS_LABEL } from '@clumera/module-tournaments';
import { sportDefinition } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { RegisterTeamForm, TournamentAction } from '@/components/TournamentForms';
import { playDayLabel } from '@/components/TournamentViews';
import { permissionChecker } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Torneos' };
export const dynamic = 'force-dynamic';

const TEAM_STATUS: Record<string, { label: string; tone: string }> = { registered: { label: 'Falta pagar la inscripción', tone: 'cx-tag--warn' }, confirmed: { label: 'Confirmado', tone: 'cx-tag--ok' } };

/**
 * Torneos del socio (lienzo «Torneos y eventos»): inscribir un equipo como capitán, ver los equipos
 * propios y abrir la página pública de cada torneo con fixture y tabla.
 */
export default async function TournamentsPage() {
  await requireModulePage('tournaments');
  const session = await requireSession('/torneos');
  const can = await permissionChecker(session.personId);
  const db = getPrisma();
  const [tournaments, mine] = await Promise.all([listTournaments(db), captainTeams(db, session.personId)]);
  const register = can('tournaments:register');
  return (
    <AppShell session={session} current="/torneos" title="Torneos">
      <h1>Torneos</h1>
      {mine.length ? (
        <section className="cx-stack" aria-label="Mis equipos">
          <h2 className="home-sec">Mis equipos</h2>
          {mine.map((t) => (
            <div key={t.id} className="home-row" aria-label={`${t.name} en ${t.tournament.name}`}>
              <span className="enroll-row__avatar" aria-hidden="true">
                {t.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="home-row__body">
                <strong>{t.name}</strong>
                <span className="cx-muted">
                  {t.tournament.name} · capitán{t.zone ? ` · Zona ${t.zone}` : ''}
                </span>
              </span>
              <span className={`cx-tag ${TEAM_STATUS[t.status]?.tone ?? ''}`}>{TEAM_STATUS[t.status]?.label ?? t.status}</span>
              {t.status === 'registered' ? (
                <Link className="cx-link" href="/pagos">
                  Pagar
                </Link>
              ) : null}
              {t.tournament.status === 'registration' ? <TournamentAction url={`/api/m/tournaments/teams/${t.id}/withdraw`} label="Dar de baja" busyLabel="Guardando…" variant="secondary" ariaLabel={`Dar de baja a ${t.name}`} /> : null}
            </div>
          ))}
        </section>
      ) : null}
      {tournaments.length === 0 ? <p className="cx-muted">Todavía no hay torneos.</p> : null}
      <div className="tcards">
        {tournaments.map((t) => {
          const full = t._count.teams >= t.maxTeams;
          return (
            <Card key={t.id} aria-label={t.name}>
              <span className="cx-muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                {sportDefinition(t.sportCode)?.label ?? t.sportCode}
              </span>
              <h2 className="cx-card__title" style={{ margin: 0 }}>
                {t.name}
              </h2>
              <p className="cx-muted" style={{ margin: 0 }}>
                {playDayLabel(t.playDay)} · {t._count.teams} de {t.maxTeams} equipos · {t.entryFee ? `${formatMoney(t.entryFee)} por equipo` : 'sin costo'}
              </p>
              <div className="cx-tags">
                <span className={`cx-tag ${t.status === 'registration' ? 'cx-tag--ok' : t.status === 'finished' ? '' : 'cx-tag--info'}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              {t.status === 'registration' && register ? full ? <p className="cx-muted">El cupo está completo.</p> : <RegisterTeamForm tournamentId={t.id} tournament={t.name} fee={t.entryFee ? formatMoney(t.entryFee) : null} /> : null}
              {t.publicPage ? (
                <Link className="cx-link" href={`/torneos/${t.slug}`}>
                  Ver fixture y posiciones
                </Link>
              ) : null}
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
