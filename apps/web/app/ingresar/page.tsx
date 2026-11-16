import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { LoginForm } from '@/components/LoginForm';
import { clientConfig } from '@/lib/client-config';
import { safeNext } from '@/lib/safe-next';
import { getCurrentSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentSession()) redirect(next);
  return (
    <AuthShell title="Ingresar">
      <p>{clientConfig.login.description}</p>
      <LoginForm next={next} />
    </AuthShell>
  );
}
