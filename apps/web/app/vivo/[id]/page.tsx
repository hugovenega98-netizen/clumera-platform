import { liveView } from '@clumera/sports';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { LiveBoard, type LiveData } from '@/components/LiveBoard';
import { FollowToggle, GuestCodeForm, StreamEmbed } from '@/components/MatchExtras';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { guestAllowed } from '@/lib/guest';
import { getCurrentSession } from '@/lib/session';
import { teamAccess } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'En vivo' };
export const dynamic = 'force-dynamic';

/**
 * Minuto a minuto con la transmisión. Público (sin cuenta) si el coach lo publicó; si no, para el
 * club con sesión o para invitados con un código del partido.
 */
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getPrisma();
  const view = await liveView(db, id);
  if (!view) notFound();
  const session = await getCurrentSession();
  const guest = !view.mamPublic && !session && (await guestAllowed(id));
  if (!view.mamPublic && !guest) {
    if (!session) {
      return (
        <main className="cx-page cx-stack" style={{ maxWidth: 480, margin: '0 auto' }}>
          <header className="adm-bar">
            <img src={clientConfig.assets.emblem} alt="" width={40} height={40} />
            <h1 style={{ fontSize: 22 }}>{clientConfig.identity.displayName} · En vivo</h1>
          </header>
          <p>
            {view.teamName} vs. {view.opponent}: este partido es del club. Si te pasaron un código de invitado, ingresalo.
          </p>
          <GuestCodeForm matchId={id} />
          <Link className="cx-btn cx-btn--secondary" href={`/ingresar?next=${encodeURIComponent(`/vivo/${id}`)}`}>
            Ingresar al club
          </Link>
        </main>
      );
    }
    const m = await db.match.findUniqueOrThrow({ where: { id }, select: { team: { select: { slug: true, sport: { select: { slug: true } } } } } });
    if (!(await teamAccess(session.personId, m.team)).view) notFound();
  }
  const following = session ? Boolean(await db.matchFollow.findUnique({ where: { matchId_personId: { matchId: id, personId: session.personId } } })) : false;
  const ended = ['played', 'cancelled'].includes(view.status);
  const board = (
    <div className="cx-stack">
      {view.streamVideoId ? <StreamEmbed videoId={view.streamVideoId} title={`${view.teamName} vs. ${view.opponent}`} /> : null}
      <LiveBoard initial={view as unknown as LiveData} />
    </div>
  );
  if (session) {
    return (
      <AppShell session={session} current="/deportes" title="En vivo">
        {ended ? null : <FollowToggle matchId={id} following={following} />}
        {board}
      </AppShell>
    );
  }
  return (
    <main className="cx-page cx-stack" style={{ maxWidth: 720, margin: '0 auto' }}>
      <header className="adm-bar">
        <img src={clientConfig.assets.emblem} alt="" width={40} height={40} />
        <h1 style={{ fontSize: 22 }}>{clientConfig.identity.displayName} · En vivo</h1>
      </header>
      {board}
      <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
        Se actualiza solo.{guest ? ' Estás como invitado.' : ''} <Link href="/ingresar">Ingresar al club</Link>
      </p>
    </main>
  );
}
