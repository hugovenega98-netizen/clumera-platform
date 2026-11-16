import { catalog } from '@clumera/catalog';
import { Button, Card } from '@clumera/ui';
import Link from 'next/link';
import { getManagementDb } from '@/db';
import { logoutAction } from './actions';
import { requireAdmin } from '@/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const admin = await requireAdmin();
  const list = await getManagementDb().installation.findMany({
    orderBy: { createdAt: 'desc' },
    include: { licenses: { where: { revokedAt: null }, take: 1, orderBy: { issuedAt: 'desc' } } },
  });
  return (
    <main className="cx-page cx-stack">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1>Instalaciones</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="cx-btn cx-btn--primary" href="/instalaciones/nueva">
            Nueva instalación
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              Salir ({admin.email})
            </Button>
          </form>
        </div>
      </header>
      <Card>
        {list.length === 0 ? (
          <p>Todavía no hay instalaciones.</p>
        ) : (
          <ul className="cx-list">
            {list.map((i) => (
              <li key={i.id} className="cx-list__item">
                <Link href={`/instalaciones/${i.id}`}>
                  <strong>{i.displayName}</strong>
                </Link>{' '}
                <span className="cx-muted">
                  {i.clientId} · {i.customDomain ?? `${i.subdomain}.clumera.app`} · {i.status} · {i.licenses[0]?.modules.length ?? 0} módulos
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Catálogo de módulos">
        <ul className="cx-list">
          {catalog.all.map((m) => (
            <li key={m.id} className="cx-list__item">
              <strong>{m.name}</strong> <span className="cx-muted">
                {m.id} · v{m.version} · {m.kind === 'core' ? 'core' : 'licenciable'}
                {m.dependsOn.length ? ` · necesita ${m.dependsOn.join(', ')}` : ''} · {m.permissions.length} permisos
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
