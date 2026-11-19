import { IMPORT_COLUMNS, IMPORT_MAX_ROWS, membershipCategories } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { ImportPeople } from '@/components/ImportPeople';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';

export const metadata: Metadata = { title: 'Importar padrón' };
export const dynamic = 'force-dynamic';

/** Importar el padrón desde Excel o CSV: vista previa por fila y confirmación. */
export default async function ImportPage() {
  const { session } = await requireAdmin('/admin/personas/importar', 'identity:person.manage');
  const categories = await membershipCategories(getPrisma());
  return (
    <AppShell session={session} current="/admin/personas" title="Importar padrón" space="admin">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/admin/personas">
          ← Padrón
        </Link>
      </nav>
      <h1>Importar padrón</h1>
      <div className="import-layout">
        <Card title="Archivo">
          <ImportPeople />
        </Card>
        <Card title="Cómo armar la planilla">
          <p className="cx-muted">Primera fila con los títulos; una persona por fila. Hasta {IMPORT_MAX_ROWS} filas y 2 MB, en .xlsx o .csv.</p>
          <div className="rows">
            {IMPORT_COLUMNS.map((c) => (
              <div key={c}>
                <span className="grow">{c}</span>
                <span className="cx-muted">{c === 'Nombre' || c === 'Apellido' ? 'obligatoria' : 'opcional'}</span>
              </div>
            ))}
          </div>
          <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
            Categorías válidas: {categories.map((c) => c.name).join(', ')}. Las fechas, como dd/mm/aaaa. Si la persona ya está (por documento o N° de socio), se completan sus datos; nunca se duplica. El documento
            se guarda cifrado.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
