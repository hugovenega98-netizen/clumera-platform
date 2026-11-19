import { formatMoney } from '@clumera/finance';
import { searchPeople } from '@clumera/identity';
import { teamWithSport } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { MemberToggle } from '@/components/SportsAdminForms';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { docPepper } from '@/lib/people-api';

export const metadata: Metadata = { title: 'Plantel' };
export const dynamic = 'force-dynamic';

/** Plantel de un equipo: quién juega, sumar desde el padrón, quitar. */
export default async function TeamAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const q = ((await searchParams).q ?? '').slice(0, 100);
  const { session } = await requireAdmin(`/admin/deportes/equipos/${id}`, 'sports:manage');
  const db = getPrisma();
  const team = await teamWithSport(db, id);
  if (!team) notFound();
  const [members, coaches, found] = await Promise.all([
    db.teamMember.findMany({ where: { teamId: id, active: true }, include: { person: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { person: { lastName: 'asc' } } }),
    db.roleAssignment.findMany({ where: { active: true, OR: [{ scopeType: 'team', scopeId: team.slug }, { scopeType: 'sport', scopeId: team.sport.slug }], roleCode: { in: ['coach', 'desk', 'medical'] } }, include: { person: { select: { firstName: true, lastName: true } }, role: { select: { name: true } } } }),
    q ? searchPeople(db, { q, pepper: docPepper() }) : null,
  ]);
  const memberIds = new Set(members.map((m) => m.personId));
  return (
    <AppShell session={session} current="/admin/deportes" title="Plantel" space="admin">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/admin/deportes">
          ← Deportes
        </Link>
      </nav>
      <header>
        <h1>
          {team.sport.name} · {team.name}
        </h1>
        <p className="cx-muted">
          Ámbito <code>{team.slug}</code> · {team.monthlyFee ? `arancel ${formatMoney(team.monthlyFee)}` : 'sin arancel'}
        </p>
      </header>
      <div className="cx-columns">
        <Card title={`Plantel · ${members.length}`}>
          {members.length === 0 ? <p className="cx-muted">Sin jugadores.</p> : null}
          <div className="rows">
            {members.map((m) => (
              <div key={m.id}>
                <span className="grow">
                  {m.person.lastName}, {m.person.firstName}
                </span>
                <MemberToggle teamId={id} personId={m.personId} active label={`${m.person.firstName} ${m.person.lastName}`} />
              </div>
            ))}
          </div>
        </Card>
        <div className="cx-stack">
          <Card title="Sumar al plantel">
            <form className="search-row" role="search" action={`/admin/deportes/equipos/${id}`}>
              <input className="cx-input" type="search" name="q" defaultValue={q} aria-label="Buscar persona" placeholder="Nombre, DNI o N° de socio…" />
              <button className="cx-btn cx-btn--secondary" type="submit">
                Buscar
              </button>
            </form>
            {found ? (
              <div className="rows">
                {found.items.map((p) => (
                  <div key={p.id}>
                    <span className="grow">
                      {p.lastName}, {p.firstName}
                      <span className="cx-muted" style={{ display: 'block' }}>
                        {p.memberNumber ? `N° ${p.memberNumber}` : 'No socio'}
                        {p.age != null ? ` · ${p.age} años` : ''}
                      </span>
                    </span>
                    {memberIds.has(p.id) ? <span className="cx-tag cx-tag--ok">En el plantel</span> : <MemberToggle teamId={id} personId={p.id} active={false} label={`${p.firstName} ${p.lastName}`} />}
                  </div>
                ))}
                {found.items.length === 0 ? <p className="cx-muted">Sin resultados.</p> : null}
              </div>
            ) : null}
          </Card>
          <Card title="Cuerpo técnico y mesa">
            {coaches.length === 0 ? <p className="cx-muted">Sin roles asignados. Se asignan desde la ficha de cada persona.</p> : null}
            {coaches.map((c) => (
              <div className="kv" key={c.id}>
                <span>{c.role.name}</span>
                <b>
                  {c.person.firstName} {c.person.lastName}
                </b>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
