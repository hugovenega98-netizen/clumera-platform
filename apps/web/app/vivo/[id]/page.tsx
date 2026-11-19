import { liveView } from '@clumera/sports';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { LiveBoard, type LiveData } from '@/components/LiveBoard';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/session';
import { teamAccess } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'En vivo' };
export const dynamic = 'force-dynamic';

/** Minuto a minuto. Público (sin cuenta) si el coach lo publicó; si no, para el club con sesión. */
export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getPrisma();
  const view = await liveView(db, id);
  if (!view) notFound();
  const session = await getCurrentSession();
  if (!view.mamPublic) {
    if (!session) redirect(`/ingresar?next=${encodeURIComponent(`/vivo/${id}`)}`);
    const m = await db.match.findUniqueOrThrow({ where: { id }, select: { team: { select: { slug: true, sport: { select: { slug: true } } } } } });
    if (!(await teamAccess(session.personId, m.team)).view) notFound();
  }
  const board = <LiveBoard initial={view as unknown as LiveData} />;
  if (session) {
    return (
      <AppShell session={session} current="/deportes" title="En vivo">
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
        Se actualiza solo. <Link href="/ingresar">Ingresar al club</Link>
      </p>
    </main>
  );
}
