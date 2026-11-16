import { Card, InstallApp } from '@clumera/ui';
import { clientConfig } from '@/lib/client-config';
import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { LogoutButton } from '@/components/LogoutButton';
import { PushOptIn } from '@/components/PushOptIn';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mi cuenta' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await requireSession('/cuenta');
  return (
    <AppShell session={session} current="/cuenta" title="Mi cuenta">
      <h1>Mi cuenta</h1>
      <Card title={`${session.firstName} ${session.lastName}`}>
        <p className="cx-muted">Usuario: {session.login}</p>
        <LogoutButton />
      </Card>
      <Card title="App en el teléfono">
        <p className="cx-muted">Instalala para abrirla desde un ícono, usarla sin conexión y recibir avisos (en iPhone, los avisos solo llegan con la app instalada).</p>
        <InstallApp appName={clientConfig.pwa.shortName} />
      </Card>
      <PushOptIn vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
    </AppShell>
  );
}
