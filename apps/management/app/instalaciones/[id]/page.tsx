import { publicOrigin, type ClientConfig, clientConfigSchema } from '@clumera/config';
import { Card, Notice } from '@clumera/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReissueForm } from '@/components/ReissueForm';
import { getManagementDb } from '@/db';
import { installationEnv, installationInput, licenseKeysFromEnv, scaffoldClientConfig } from '@/installations';
import { requireAdmin } from '@/server';

export const dynamic = 'force-dynamic';

const pre = { whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const, fontSize: 13, background: '#f3f6f9', padding: 12, borderRadius: 8 };

export default async function InstallationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string; licencia?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const flags = await searchParams;
  const db = getManagementDb();
  const inst = await db.installation.findUnique({
    where: { id },
    include: { licenses: { orderBy: { issuedAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' }, take: 20 } },
  });
  if (!inst) notFound();
  const active = inst.licenses.find((l) => !l.revokedAt);
  const config = clientConfigSchema.parse(
    scaffoldClientConfig(installationInput.parse({ ...inst, modules: active?.modules ?? [], customDomain: inst.customDomain })),
  ) as ClientConfig;
  const env = active ? installationEnv(inst.clientId, active.token, licenseKeysFromEnv(), publicOrigin(config)) : null;

  return (
    <main className="cx-page cx-stack">
      <Link className="cx-link" href="/">
        ← Instalaciones
      </Link>
      <h1>{inst.displayName}</h1>
      {flags.nueva ? <Notice tone="ok">Instalación dada de alta. Seguí los pasos de abajo para desplegarla.</Notice> : null}
      {flags.licencia ? <Notice tone="ok">Licencia nueva emitida. Actualizá CLUMERA_LICENSE en Vercel y volvé a desplegar.</Notice> : null}

      <Card title="Licencia vigente">
        {active ? (
          <p>
            {active.modules.length ? active.modules.join(', ') : 'solo módulos core'} · {active.sportsLimit} deportes ·{' '}
            {active.expiresAt ? `vence ${active.expiresAt.toISOString().slice(0, 10)}` : 'sin vencimiento'} · {active.licenseId}
          </p>
        ) : (
          <p>Sin licencia vigente.</p>
        )}
        <ReissueForm installationId={inst.id} sportsLimit={active?.sportsLimit ?? 1} selected={active?.modules ?? []} />
      </Card>

      <Card title="1 · Config del club en el repo">
        <p>
          Guardá esto como <code>clients/{inst.clientId}/client.config.json</code> y los logos e íconos en <code>clients/{inst.clientId}/public/</code>{' '}
          (mismas rutas que <code>clients/club-ejemplo</code>). Ajustá colores y textos: el build valida contraste y recursos.
        </p>
        <pre style={pre}>{JSON.stringify(config, null, 2)}</pre>
      </Card>

      <Card title="2 · Base de datos">
        <p>Creá una base de Neon para el club y aplicá las migraciones y el arranque:</p>
        <pre style={pre}>{`DATABASE_URL=… npm run migrate:deploy -w @clumera/db
DATABASE_URL=… CLUMERA_CLIENT_ID=${inst.clientId} npm run bootstrap -w @clumera/web -- \\
  --admin-email <email del administrador del club> --admin-first <nombre> --admin-last <apellido>`}</pre>
      </Card>

      <Card title="3 · Proyecto de Vercel">
        <p>
          Raíz <code>apps/web</code>, comando de build <code>cd ../.. && npx turbo run build --filter=@clumera/web</code>, y estas variables:
        </p>
        {env ? <pre style={pre}>{Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}</pre> : null}
      </Card>

      <Card title="Historial">
        <ul className="cx-list">
          {inst.events.map((e) => (
            <li key={e.id} className="cx-list__item cx-muted">
              {e.createdAt.toISOString().slice(0, 16).replace('T', ' ')} · {e.type} · {e.actor}
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
