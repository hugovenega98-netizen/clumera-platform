import { catalog } from '@clumera/catalog';
import { Card } from '@clumera/ui';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { clientConfig } from '@/lib/client-config';
import { getLicenseState } from '@/lib/license';
import { navigationFor } from '@/lib/navigation';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await requireSession('/');
  const { enabled } = await getLicenseState();
  const items = navigationFor('member', catalog, enabled, clientConfig.modules.visible);
  return (
    <AppShell firstName={session.firstName}>
      <header>
        <h1>Hola, {session.firstName}</h1>
        <p>{clientConfig.identity.tagline}</p>
      </header>
      <Card title="Tu club">
        <nav aria-label="Secciones">
          <ul className="cx-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {items.map((item) => (
              <li key={`${item.moduleId}:${item.id}`}>
                <Link className="cx-btn cx-btn--secondary cx-btn--block" href={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Card>
      <footer>
        <small>{clientConfig.identity.footer}</small>
      </footer>
    </AppShell>
  );
}
