import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { staffTeams } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Mesa de control' };
export const dynamic = 'force-dynamic';

const when = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

/** Partidos en juego y de los próximos días de los deportes que la persona opera. */
export default async function DeskList() {
  const session = await requireSession('/deportes/mesa');
  const { desk } = await staffTeams(session.personId);
  if (!desk.length) forbidden();
  const since = new Date(Date.now() - 12 * 3600_000);
  const until = new Date(Date.now() + 7 * 86_400_000);
  const matches = await getPrisma().match.findMany({
    where: { teamId: { in: desk.map((t) => t.id) }, OR: [{ status: 'live' }, { status: 'scheduled', startsAt: { gte: since, lte: until } }] },
    include: { team: { include: { sport: true } } },
    orderBy: [{ status: 'asc' }, { startsAt: 'asc' }],
  });
  return (
    <AppShell session={session} current="/deportes" title="Mesa de control">
      <h1>Mesa de control</h1>
      <Card title="Partidos">
        {matches.length === 0 ? <p className="cx-muted">No hay partidos en juego ni programados para esta semana.</p> : null}
        <div className="rows">
          {matches.map((m) => (
            <div key={m.id}>
              <span className="grow">
                <Link className="cx-link" href={`/deportes/mesa/${m.id}`}>
                  {m.team.sport.name} · {m.team.name} vs. {m.opponent}
                </Link>
                <span className="cx-muted" style={{ display: 'block' }}>
                  {when.format(m.startsAt)}
                  {m.venue ? ` · ${m.venue}` : ''}
                </span>
              </span>
              {m.status === 'live' ? <span className="cx-tag cx-tag--bad">● En juego</span> : <span className="cx-tag">Programado</span>}
            </div>
          ))}
        </div>
      </Card>
    </AppShell>
  );
}
