import type { Metadata } from 'next';
import { AuthShell } from '@/components/AuthShell';
import { ResetRequestForm } from '@/components/ResetRequestForm';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export default function RecoverPage() {
  return (
    <AuthShell title="Recuperar contraseña">
      <p>Te mandamos un enlace por correo para elegir una contraseña nueva.</p>
      <ResetRequestForm />
    </AuthShell>
  );
}
