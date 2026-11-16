import { Card } from '@clumera/ui';
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
    <AppShell firstName={session.firstName}>
      <h1>Mi cuenta</h1>
      <Card title={`${session.firstName} ${session.lastName}`}>
        <p className="cx-muted">Usuario: {session.login}</p>
        <LogoutButton />
      </Card>
      <PushOptIn vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''} />
    </AppShell>
  );
}
