import { Card } from '@clumera/ui';
import Link from 'next/link';
import { InstallationForm } from '@/components/InstallationForm';
import { requireAdmin } from '@/server';

export const dynamic = 'force-dynamic';

export default async function NewInstallation() {
  await requireAdmin();
  return (
    <main className="cx-page cx-stack">
      <Link className="cx-link" href="/">
        ← Instalaciones
      </Link>
      <h1>Nueva instalación</h1>
      <Card>
        <InstallationForm />
      </Card>
    </main>
  );
}
