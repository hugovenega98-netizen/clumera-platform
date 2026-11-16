import { catalog } from '@clumera/catalog';
import { Card } from '@clumera/ui';
import Link from 'next/link';
import { PushOptIn } from '@/components/PushOptIn';
import { clientConfig } from '@/lib/client-config';
import { getLicenseState } from '@/lib/license';
import { navigationFor } from '@/lib/navigation';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const { enabled } = await getLicenseState();
  const items = navigationFor('member', catalog, enabled, clientConfig.modules.visible);
  return (
    <main className="cx-page cx-stack">
      <header>
        <h1>{clientConfig.identity.displayName}</h1>
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

      <PushOptIn vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />

      <footer>
        <small>{clientConfig.identity.footer}</small>
      </footer>
    </main>
  );
}
