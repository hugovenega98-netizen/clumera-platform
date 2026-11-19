import { liveView, matchDetail } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Scoreboard, Timeline, type LiveData } from '@/components/LiveBoard';
import { CoachMatchActions, LineupForm } from '@/components/SportsForms';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { teamAccess } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Partido' };
export const dynamic = 'force-dynamic';

const when = new Intl.DateTimeFormat('es-AR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

/** El partido para el cuerpo técnico: convocatoria, formación, publicación, cierre oficial. */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/deportes/partidos/${id}`);
  const db = getPrisma();
  const m = await matchDetail(db, id);
  if (!m) notFound();
  const access = await teamAccess(session.personId, m.team);
  if (!access.coach && !access.desk) forbidden();
  const live = (await liveView(db, id))! as unknown as LiveData;
  const locked = m.status === 'played' || m.status === 'cancelled';
  const answered = m.callups.filter((c) => c.response !== 'pending').length;
  return (
    <AppShell session={session} current="/deportes" title="Partido">
      <nav aria-label="Ruta">
        <Link className="cx-link" href={`/deportes/equipos/${m.teamId}?vista=plantel`}>
          ← {m.team.sport.name} · {m.team.name}
        </Link>
      </nav>
      <header>
        <h1>{m.home ? `${m.team.name} vs. ${m.opponent}` : `${m.opponent} vs. ${m.team.name}`}</h1>
        <p className="cx-muted">
          {when.format(m.startsAt)}
          {m.venue ? ` · ${m.venue}` : ''}
        </p>
      </header>
      <Scoreboard data={live} />
      <div className="cx-columns">
        <Card title={`Convocatoria · ${answered} de ${m.callups.length} respondieron`}>
          <LineupForm
            matchId={m.id}
            locked={locked || !access.coach}
            players={m.callups.map((c) => ({ personId: c.personId, name: `${c.person.lastName}, ${c.person.firstName}`, response: c.response, inLineup: c.inLineup }))}
          />
        </Card>
        <div className="cx-stack">
          {access.coach ? (
            <Card title="Partido">
              <CoachMatchActions matchId={m.id} status={m.status} mamPublic={m.mamPublic} scoreFor={m.scoreFor} scoreAgainst={m.scoreAgainst} />
            </Card>
          ) : null}
          <Card title="Seguir">
            <div className="adm-actions">
              <Link className="cx-btn cx-btn--secondary" href={`/vivo/${m.id}`}>
                Minuto a minuto
              </Link>
              {access.desk && !locked ? (
                <Link className="cx-btn cx-btn--secondary" href={`/deportes/mesa/${m.id}`}>
                  Mesa de control
                </Link>
              ) : null}
            </div>
            {m.mamPublic ? <p className="cx-muted">Publicado: cualquiera con el enlace lo ve, sin cuenta.</p> : <p className="cx-muted">Privado: solo personas del club con sesión.</p>}
          </Card>
          <Card title="Incidencias">
            <Timeline data={live} />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
