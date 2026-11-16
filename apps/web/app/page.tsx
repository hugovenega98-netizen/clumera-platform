import { catalog } from '@clumera/catalog';
import { Card } from '@clumera/ui';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Icon, NAV_ICON } from '@/components/icons';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getLicenseState } from '@/lib/license';
import { navigationFor } from '@/lib/navigation';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const fmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

export default async function HomePage() {
  const session = await requireSession('/');
  const { enabled } = await getLicenseState();
  const items = navigationFor('member', catalog, enabled, clientConfig.modules.visible);
  const recent = await getPrisma().notification.findMany({ where: { personId: session.personId }, orderBy: { createdAt: 'desc' }, take: 3 });
  return (
    <AppShell session={session} current="/" title="Inicio">
      <header>
        <h1>Hola, {session.firstName}</h1>
        <p>{clientConfig.identity.tagline}</p>
      </header>
      <div className="cx-columns">
        <Card title="Tu club">
          <nav aria-label="Secciones del club">
            <ul className="cx-tiles">
              {items.map((item) => (
                <li key={`${item.moduleId}:${item.id}`}>
                  <Link className="cx-tile" href={item.href}>
                    <Icon name={NAV_ICON[`${item.moduleId}:${item.id}`] ?? 'more'} size={26} />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </Card>
        <Card title="Últimos avisos">
          {recent.length === 0 ? (
            <p className="cx-muted">No tenés avisos todavía.</p>
          ) : (
            <ul className="cx-list">
              {recent.map((n) => (
                <li key={n.id} className="cx-list__item">
                  <strong>{n.title}</strong>
                  <div className="cx-muted">
                    {n.source} · {fmt.format(n.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link className="cx-link" href="/avisos">
            Ver todos los avisos
          </Link>
        </Card>
      </div>
      <footer>
        <small>{clientConfig.identity.footer}</small>
      </footer>
    </AppShell>
  );
}
