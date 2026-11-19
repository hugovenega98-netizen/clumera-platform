import { institutionalSummary } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { num } from '@/lib/people-format';

export const metadata: Metadata = { title: 'Inicio institucional' };
export const dynamic = 'force-dynamic';

/**
 * Inicio institucional: el estado del padrón de un vistazo. Cada módulo suma sus números cuando
 * llega (Finanzas: cobrado y morosidad; Instalaciones: reservas del día; Accesos: entradas).
 */
export default async function AdminHome() {
  const { session, can } = await requireAdmin('/admin');
  const people = can('identity:person.view');
  const s = people ? await institutionalSummary(getPrisma()) : null;
  const max = Math.max(1, ...(s?.byCategory.map((c) => c.count) ?? [1]));
  const month = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

  return (
    <AppShell session={session} current="/admin" title="Inicio institucional" space="admin">
      <div className="adm-bar">
        <h1>Inicio institucional</h1>
        {people ? (
          <form action="/admin/personas" className="search-row" role="search" style={{ flex: '1 1 280px', maxWidth: 440 }}>
            <input className="cx-input" type="search" name="q" aria-label="Buscar persona" placeholder="Nombre, DNI o N° de socio…" />
          </form>
        ) : null}
      </div>
      {s ? (
        <>
          <section className="kpis" aria-label={`Padrón · ${month}`}>
            <Link className="kpi" href="/admin/personas?filtro=members">
              <span className="cx-muted">Socios activos</span>
              <b>{num.format(s.activeMembers)}</b>
              <span className="cx-muted">
                <span style={{ color: 'var(--cx-ok)', fontWeight: 600 }}>+{s.newThisMonth} altas</span> · {s.leftThisMonth} bajas en {month.split(' ')[0]}
              </span>
            </Link>
            <Link className="kpi" href="/admin/personas">
              <span className="cx-muted">Personas en el padrón</span>
              <b>{num.format(s.people)}</b>
              <span className="cx-muted">socios, familias, deportistas y clientes</span>
            </Link>
            <div className="kpi">
              <span className="cx-muted">Membresías suspendidas</span>
              <b>{num.format(s.suspended)}</b>
              <span className="cx-muted">no habilitan accesos</span>
            </div>
            <div className="kpi">
              <span className="cx-muted">Cuentas sin activar</span>
              <b>{num.format(s.pendingAccounts)}</b>
              <span className="cx-muted">{s.lockedAccounts} bloqueadas por intentos</span>
            </div>
            <Link className="kpi" href="/admin/personas?filtro=staff">
              <span className="cx-muted">Con roles en el club</span>
              <b>{num.format(s.staff)}</b>
              <span className="cx-muted">coaches, recepción, caja…</span>
            </Link>
          </section>
          <div className="cx-columns">
            <Card title="Socios por categoría">
              {s.byCategory.length === 0 ? (
                <p className="cx-muted">Todavía no hay categorías con socios.</p>
              ) : (
                <div className="bars">
                  {s.byCategory.map((c) => (
                    <div className="bar" key={c.name}>
                      <span>{c.name}</span>
                      <span className="bar__track" role="img" aria-label={`${c.name}: ${c.count} socios activos`}>
                        <span className="bar__fill" style={{ width: `${(c.count / max) * 100}%` }} />
                      </span>
                      <span className="bar__value">{num.format(c.count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Requiere atención">
              <div className="attention">
                <div>
                  <span className="cx-tag cx-tag--info">Socios</span>
                  <span>{s.pendingAccounts === 1 ? '1 cuenta creada sin activar' : `${s.pendingAccounts} cuentas creadas sin activar`}</span>
                </div>
                <div>
                  <span className="cx-tag cx-tag--warn">Padrón</span>
                  <span>{s.withoutAccount === 1 ? '1 adulto sin cuenta en la app' : `${s.withoutAccount} adultos sin cuenta en la app`}</span>
                  <Link className="cx-link" href="/admin/personas">
                    Ver
                  </Link>
                </div>
                {s.suspended ? (
                  <div>
                    <span className="cx-tag cx-tag--bad">Membresías</span>
                    <span>{s.suspended === 1 ? '1 membresía suspendida' : `${s.suspended} membresías suspendidas`}</span>
                  </div>
                ) : null}
              </div>
              {can('identity:person.manage') ? (
                <div className="adm-actions">
                  <Link className="cx-btn cx-btn--primary" href="/admin/personas/nueva">
                    Alta de persona
                  </Link>
                </div>
              ) : null}
            </Card>
          </div>
        </>
      ) : (
        <Card title="Tu área">
          <p className="cx-muted">Usá el menú para entrar a las áreas que tenés asignadas.</p>
        </Card>
      )}
    </AppShell>
  );
}
