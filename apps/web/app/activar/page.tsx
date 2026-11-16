import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { SetPasswordForm } from '@/components/SetPasswordForm';

export const metadata: Metadata = { title: 'Activar cuenta', referrer: 'no-referrer' };

export default async function ActivatePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <AuthShell title="Activá tu cuenta">
      <p>Elegí tu contraseña para empezar a usar la app.</p>
      <SetPasswordForm token={token} endpoint="/api/auth/activate" submitLabel="Activar cuenta" />
    </AuthShell>
  );
}
