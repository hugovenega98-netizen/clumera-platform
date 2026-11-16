import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { SetPasswordForm } from '@/components/SetPasswordForm';

export const metadata: Metadata = { title: 'Contraseña nueva', referrer: 'no-referrer' };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <AuthShell title="Elegí una contraseña nueva">
      <p>Al guardarla se cierran tus sesiones en otros dispositivos.</p>
      <SetPasswordForm token={token} endpoint="/api/auth/password-reset/confirm" submitLabel="Guardar contraseña" />
    </AuthShell>
  );
}
