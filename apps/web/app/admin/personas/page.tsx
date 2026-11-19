import { searchPeople, type PeopleFilter } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { docPepper } from '@/lib/people-api';
import { ACCOUNT_STATUS, MEMBERSHIP_STATUS, num } from '@/lib/people-format';

export const metadata: Metadata = { title: 'Socios y personas' };
export const dynamic = 'force-dynamic';

const FILTERS: Array<{ key: PeopleFilter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'members', label: 'Socios' },
  { key: 'non_members', label: 'No socios' },
  { key: 'minors', label: 'Menores' },
  { key: 'staff', label: 'Con roles' },
];

function href(q: string, filter: PeopleFilter, page = 1) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (filter !== 'all') p.set('filtro', filter);
  if (page > 1) p.set('pagina', String(page));
  const s = p.toString();
  return `/admin/personas${s ? `?${s}` : ''}`;
}

/** Padrón de personas: búsqueda por nombre (sin importar acentos), N° de socio o documento. */
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string; pagina?: string }> }) {
  const { session, can } = await requireAdmin('/admin/personas', 'identity:person.view');
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const filter = (FILTERS.find((f) => f.key === sp.filtro)?.key ?? 'all') as PeopleFilter;
  const result = await searchPeople(getPrisma(), { q, filter, page: Number(sp.pagina) || 1, pepper: docPepper() });

  return (
    <AppShell session={session} current="/admin/personas" title="Socios y personas" space="admin">
      <div className="adm-bar">
        <h1>Padrón de personas</h1>
        {can('identity:person.manage') ? (
          <Link className="cx-btn cx-btn--primary" href="/admin/personas/nueva">
            Alta de persona
          </Link>
        ) : null}
      </div>
      <Card>
        <form className="search-row" role="search" action="/admin/personas">
          {filter !== 'all' ? <input type="hidden" name="filtro" value={filter} /> : null}
          <input className="cx-input" type="search" name="q" defaultValue={q} aria-label="Buscar en el padrón" placeholder="Nombre, DNI o N° de socio…" />
          <button className="cx-btn cx-btn--secondary" type="submit">
            Buscar
          </button>
        </form>
        <nav className="chips" aria-label="Filtrar el padrón">
          {FILTERS.map((f) => (
            <Link key={f.key} href={href(q, f.key)} aria-current={f.key === filter ? 'true' : undefined}>
              {f.label} · {num.format(result.counts[f.key])}
            </Link>
          ))}
        </nav>
        {result.items.length === 0 ? (
          <p role="status">{q ? `No hay personas que coincidan con «${q}».` : 'No hay personas en este filtro.'}</p>
        ) : (
          <table className="people" aria-label="Personas">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Condición</th>
                <th scope="col">Estado</th>
                <th scope="col">Cuenta</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((p) => {
                const status = p.membershipStatus ? MEMBERSHIP_STATUS[p.membershipStatus] : null;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/personas/${p.id}`}>
                        {p.lastName}, {p.firstName}
                      </Link>
                      <div className="cx-muted">
                        {p.memberNumber ? `N° ${p.memberNumber}` : 'Sin número'}
                        {p.age !== null ? ` · ${p.age} años` : ''}
                      </div>
                    </td>
                    <td>{[p.category ? `Socio · ${p.category}` : null, ...p.roles].filter(Boolean).join(' · ') || 'No socio'}</td>
                    <td>{status ? <span className={`cx-tag ${status.tone}`}>{status.label}</span> : <span className="cx-tag">No socio</span>}</td>
                    <td className="cx-muted">{p.accountStatus ? ACCOUNT_STATUS[p.accountStatus] : 'Sin cuenta'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {result.pages > 1 ? (
          <nav className="pager" aria-label="Páginas">
            {result.page > 1 ? <Link className="cx-link" href={href(q, filter, result.page - 1)}>Anterior</Link> : <span />}
            <span className="cx-muted">
              Página {result.page} de {result.pages} · {num.format(result.total)} personas
            </span>
            {result.page < result.pages ? <Link className="cx-link" href={href(q, filter, result.page + 1)}>Siguiente</Link> : <span />}
          </nav>
        ) : null}
      </Card>
    </AppShell>
  );
}
