import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Avisos' };
export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

/** Bandeja única: todos los avisos de la persona, con su origen. */
export default async function InboxPage() {
  const session = await requireSession('/avisos');
  const items = await getPrisma().notification.findMany({
    where: { personId: session.personId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return (
    <AppShell firstName={session.firstName}>
      <h1>Avisos</h1>
      <Card>
        {items.length === 0 ? (
          <p>No tenés avisos todavía.</p>
        ) : (
          <ul className="cx-list">
            {items.map((n) => (
              <li key={n.id} className="cx-list__item">
                <strong>{n.title}</strong>
                <div>{n.body}</div>
                <div className="cx-muted">
                  {fmt.format(n.createdAt)} · {n.source}
                  {n.url && n.url !== '/avisos' ? (
                    <>
                      {' · '}
                      <Link href={n.url}>Ver</Link>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
