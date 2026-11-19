import { myTeams } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CallupButtons } from '@/components/SportsForms';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { staffTeams } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Mis deportes' };
export const dynamic = 'force-dynamic';

const when = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

/**
 * Mis deportes: donde juega la persona y su familia a cargo (con la convocatoria al próximo
 * partido), los equipos que dirige y la mesa que opera. Una sola cuenta para todo.
 */
export default async function MySportsPage() {
  const session = await requireSession('/deportes');
  const [teams, staff] = await Promise.all([myTeams(getPrisma(), session.personId), staffTeams(session.personId)]);
  return (
    <AppShell session={session} current="/deportes" title="Mis deportes">
      <h1>Mis deportes</h1>
      {teams.length === 0 && staff.coach.length === 0 && staff.desk.length === 0 ? (
        <Card title="Sin deportes">
          <p className="cx-muted">Todavía no formás parte de ningún plantel. La coordinación del deporte te suma.</p>
        </Card>
      ) : null}
      {teams.length ? (
        <section className="cx-stack" aria-label="Donde jugás">
          <div className="cx-columns">
            {teams.map((t) => (
              <Card key={`${t.teamId}:${t.person.id}`} className="team-card" aria-label={`${t.sportName} · ${t.teamName}${t.person.isSelf ? '' : ` · ${t.person.firstName}`}`}>
                <div className="team-card__head">
                  <h2 className="cx-card__title" style={{ margin: 0 }}>
                    {t.sportName} · {t.teamName}
                  </h2>
                  {t.person.isSelf ? null : <span className="cx-tag cx-tag--info">{t.person.firstName}</span>}
                </div>
                {t.nextMatch ? (
                  <>
                    <div>
                      <span className="cx-muted">Próximo partido</span>
                      <div style={{ fontWeight: 700 }}>
                        {t.nextMatch.home ? `${t.teamName} vs. ${t.nextMatch.opponent}` : `${t.nextMatch.opponent} vs. ${t.teamName}`}
                      </div>
                      <div className="cx-muted">
                        {when.format(t.nextMatch.startsAt)}
                        {t.nextMatch.venue ? ` · ${t.nextMatch.venue}` : ''}
                      </div>
                    </div>
                    {t.nextMatch.status === 'scheduled' ? (
                      <CallupButtons matchId={t.nextMatch.id} personId={t.person.id} response={t.nextMatch.response} who={t.person.isSelf ? undefined : t.person.firstName} />
                    ) : (
                      <Link className="cx-btn cx-btn--secondary" href={`/vivo/${t.nextMatch.id}`}>
                        Seguir en vivo
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="cx-muted">Sin partidos programados.</p>
                )}
                <Link className="cx-link" href={`/deportes/equipos/${t.teamId}${t.person.isSelf ? '' : `?persona=${t.person.id}`}`}>
                  Partidos, disponibilidad y rendimiento
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
      {staff.coach.length ? (
        <Card title="Equipos que dirigís">
          <div className="rows">
            {staff.coach.map((t) => (
              <div key={t.id}>
                <span className="grow">
                  <Link className="cx-link" href={`/deportes/equipos/${t.id}?vista=plantel`}>
                    {t.sport.name} · {t.name}
                  </Link>
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {staff.desk.length ? (
        <Card title="Mesa de control">
          <p className="cx-muted">Operás la mesa de {[...new Set(staff.desk.map((t) => t.sport.name))].join(', ')}.</p>
          <Link className="cx-btn cx-btn--primary" href="/deportes/mesa">
            Ir a la mesa
          </Link>
        </Card>
      ) : null}
    </AppShell>
  );
}
