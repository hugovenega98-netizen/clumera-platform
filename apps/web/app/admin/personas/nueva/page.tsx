import { membershipCategories } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { PersonForm } from '@/components/PersonForm';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Alta de persona' };
export const dynamic = 'force-dynamic';

export default async function NewPersonPage() {
  const { session } = await requireAdmin('/admin/personas/nueva', 'identity:person.manage');
  const categories = await membershipCategories(getPrisma());
  return (
    <AppShell session={session} current="/admin/personas" title="Alta de persona" space="admin">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/admin/personas">
          ← Padrón
        </Link>
      </nav>
      <h1>Alta de persona</h1>
      <Card>
        <p className="cx-muted">Si el documento ya está en el padrón, te llevamos a esa ficha: una persona existe una sola vez en el club.</p>
        <PersonForm categories={categories} />
      </Card>
    </AppShell>
  );
}
