import { canRecordSportEvent, liveView, matchDetail, requireSport, usesClock } from '@clumera/sports';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { DeskConsole } from '@/components/DeskConsole';
import type { LiveData } from '@/components/LiveBoard';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { teamAccess } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Mesa de control' };
export const dynamic = 'force-dynamic';

export default async function DeskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/deportes/mesa/${id}`);
  const db = getPrisma();
  const m = await matchDetail(db, id);
  if (!m) notFound();
  if (!(await teamAccess(session.personId, m.team)).desk) forbidden();
  const sport = requireSport(m.team.sport.code);
  const live = (await liveView(db, id))! as unknown as LiveData;
  return (
    <AppShell session={session} current="/deportes" title="Mesa de control">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/deportes/mesa">
          ← Partidos
        </Link>
      </nav>
      <DeskConsole
        initial={live}
        events={sport.events.filter((e) => canRecordSportEvent(sport.code, e.id))}
        players={m.callups.filter((c) => c.inLineup).map((c) => ({ personId: c.personId, name: `${c.person.firstName} ${c.person.lastName}` }))}
        usesClock={usesClock(sport.code)}
        family={sport.family}
        periodCount={sport.periodCount}
      />
    </AppShell>
  );
}
