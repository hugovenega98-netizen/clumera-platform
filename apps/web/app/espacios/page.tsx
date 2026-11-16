import { catalog } from '@clumera/catalog';
import { loadActor, spacesFor } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Icon, NAV_ICON } from '@/components/icons';
import { SpaceSwitcher } from '@/components/SpaceSwitcher';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getLicenseState } from '@/lib/license';
import { navigationFor } from '@/lib/navigation';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Más y espacios' };
export const dynamic = 'force-dynamic';

/** «Más» del dock: todas las secciones, la cuenta y el selector de espacios. */
export default async function SpacesPage() {
  const session = await requireSession('/espacios');
  const db = getPrisma();
  const spaces = await spacesFor(db, await loadActor(db, session.personId));
  const { enabled } = await getLicenseState();
  const sections = [...navigationFor('member', catalog, enabled, clientConfig.modules.visible), ...navigationFor('sports', catalog, enabled, clientConfig.modules.visible)];
  return (
    <AppShell session={session} current="/espacios" title="Más y espacios">
      <div className="cx-columns">
        <Card title="Mis espacios">
          <p className="cx-muted">Una sola cuenta. Elegí desde dónde querés trabajar; cada espacio muestra solo lo que te corresponde.</p>
          <SpaceSwitcher spaces={spaces} active={session.activeContext ?? 'member'} />
        </Card>
        <Card title="Secciones">
          <nav className="list-nav" aria-label="Todas las secciones">
            {sections.map((n) => (
              <Link key={`${n.moduleId}:${n.id}`} href={n.href}>
                <Icon name={NAV_ICON[`${n.moduleId}:${n.id}`] ?? 'more'} />
                {n.label}
              </Link>
            ))}
            <Link href="/cuenta">
              <Icon name="more" />
              Mi cuenta
            </Link>
          </nav>
        </Card>
      </div>
    </AppShell>
  );
}
