import { knownScopes, personProfile } from '@clumera/identity';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { InviteAccount, RevokeCredential } from '@/components/CredentialActions';
import { AssignRoleForm, RemoveRoleButton } from '@/components/RoleManager';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { isSuperadmin } from '@/lib/people-api';
import { ACCOUNT_STATUS, dateFmt, dateTimeFmt, initials, MEMBERSHIP_STATUS } from '@/lib/people-format';

export const metadata: Metadata = { title: 'Ficha de persona' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'membresia', label: 'Membresía' },
  { key: 'familia', label: 'Familia' },
  { key: 'roles', label: 'Roles' },
  { key: 'credenciales', label: 'Cuenta y carnet' },
  { key: 'historial', label: 'Historial' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const ACTION: Record<string, string> = {
  'person.created': 'Alta en el padrón',
  'role.assigned': 'Rol asignado',
  'role.revoked': 'Rol quitado',
  'credential.revoked': 'Carnet revocado',
};
const FAMILY_ROLE = { guardian: 'Responsable', member: 'Integrante', dependent: 'A cargo' } as const;

function describe(diff: unknown): string {
  if (!diff || typeof diff !== 'object') return '';
  const d = diff as Record<string, unknown>;
  if (typeof d.role === 'string') return `${d.role} · ${String(d.scope ?? '')}`;
  if (typeof d.reason === 'string') return d.reason;
  if (d.membership && typeof d.membership === 'object') {
    const m = d.membership as { category?: string; memberNumber?: string };
    return `Socio N° ${m.memberNumber ?? '—'} · ${m.category ?? ''}`;
  }
  return '';
}

/**
 * Ficha de una persona: datos, membresía, familia, roles con ámbito, cuenta y carnet, historial.
 * Sin datos clínicos (permiso propio de Salud) ni deuda (llega con Finanzas, con su permiso).
 */
export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { session, can } = await requireAdmin(`/admin/personas/${id}`, 'identity:person.view');
  const wanted = (await searchParams).tab;
  const tab = (TABS.find((t) => t.key === wanted)?.key ?? 'resumen') as Tab;
  const db = getPrisma();
  const p = await personProfile(db, id);
  if (!p) notFound();
  const manage = can('identity:person.manage');
  const assign = can('identity:role.assign');
  const roles = assign ? (await db.role.findMany({ orderBy: { name: 'asc' }, select: { code: true, name: true } })).filter((r) => r.code !== 'member') : [];
  const superadmin = assign && (await isSuperadmin(session.personId));
  const known = assign ? await knownScopes(db) : [];
  const current = p.memberships[0] ?? null;
  const status = current ? MEMBERSHIP_STATUS[current.status] : null;
  const card = p.credentials.find((c) => c.kind === 'member_card' && c.status === 'active');
  const familyName = p.family[0];

  return (
    <AppShell session={session} current="/admin/personas" title="Ficha" space="admin">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/admin/personas">
          ← Padrón
        </Link>
      </nav>
      <header className="profile-head">
        <span className="profile-head__avatar" aria-hidden="true">
          {initials(p.firstName, p.lastName)}
        </span>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h1>
            {p.firstName} {p.lastName}
          </h1>
          <div className="cx-muted">
            {[p.docLast4 ? `DNI ••• ${p.docLast4}` : null, p.age !== null ? `${p.age} años` : null, p.email, familyName ? `${familyName.name} (${familyName.members.length})` : null].filter(Boolean).join(' · ')}
          </div>
        </div>
        {status ? <span className={`cx-tag ${status.tone}`}>{status.label}</span> : <span className="cx-tag">No socio</span>}
        {can('finance:account.view') ? (
          <Link className="cx-btn cx-btn--secondary" href={`/admin/finanzas/cuentas/${id}`}>
            Ver cuenta
          </Link>
        ) : null}
      </header>
      <nav className="profile-tabs" aria-label="Ficha">
        {TABS.map((t) => (
          <Link key={t.key} href={t.key === 'resumen' ? `/admin/personas/${id}` : `/admin/personas/${id}?tab=${t.key}`} aria-current={t.key === tab ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'resumen' ? (
        <div className="dims">
          <Card title="Membresía social">
            {current ? (
              <>
                <div className="kv">
                  <span>N° de socio</span>
                  <b>{current.number ?? '—'}</b>
                </div>
                <div className="kv">
                  <span>Categoría</span>
                  <b>{current.category}</b>
                </div>
                <div className="kv">
                  <span>Alta</span>
                  <b>{dateFmt.format(current.validFrom)}</b>
                </div>
                <div className="kv">
                  <span>Estado</span>
                  <b>{status?.label}</b>
                </div>
              </>
            ) : (
              <p className="cx-muted">No es socio del club.</p>
            )}
          </Card>
          <Card title="Datos de contacto">
            <div className="kv">
              <span>Email</span>
              <b>{p.email ?? '—'}</b>
            </div>
            <div className="kv">
              <span>Teléfono</span>
              <b>{p.phone ?? '—'}</b>
            </div>
            <div className="kv">
              <span>Nacimiento</span>
              <b>{p.birthDate ? dateFmt.format(p.birthDate) : '—'}</b>
            </div>
          </Card>
          <Card title="Roles operativos">
            {p.roles.length ? (
              p.roles.map((r) => (
                <div className="kv" key={r.id}>
                  <span>{r.roleName}</span>
                  <b>{r.scope}</b>
                </div>
              ))
            ) : (
              <p className="cx-muted">Sin roles: participa como socio o cliente.</p>
            )}
            <Link className="cx-link" href={`/admin/personas/${id}?tab=roles`}>
              {assign ? 'Gestionar roles y alcance' : 'Ver roles'}
            </Link>
          </Card>
          <Card title="Cuenta y carnet">
            <div className="kv">
              <span>Cuenta</span>
              <b>{p.account ? `${ACCOUNT_STATUS[p.account.status]}${p.account.lastLoginAt ? ` · último ingreso ${dateTimeFmt.format(p.account.lastLoginAt)}` : ''}` : 'Sin cuenta'}</b>
            </div>
            <div className="kv">
              <span>Carnet QR</span>
              <b>{card ? 'Vigente' : current?.status === 'active' ? 'Se emite al abrirlo' : 'No habilitado'}</b>
            </div>
            <Link className="cx-link" href={`/admin/personas/${id}?tab=credenciales`}>
              Ver cuenta y carnet
            </Link>
          </Card>
        </div>
      ) : null}

      {tab === 'membresia' ? (
        <Card title="Membresías">
          {p.memberships.length === 0 ? <p className="cx-muted">No tiene membresías.</p> : null}
          <div className="rows">
            {p.memberships.map((m) => (
              <div key={m.id}>
                <span className="grow">
                  <strong>
                    {m.category} · N° {m.number ?? '—'}
                  </strong>
                  <span className="cx-muted" style={{ display: 'block' }}>
                    Desde {dateFmt.format(m.validFrom)}
                    {m.validTo ? ` hasta ${dateFmt.format(m.validTo)}` : ''}
                  </span>
                  {m.history.map((h, i) => (
                    <span key={i} className="cx-muted" style={{ display: 'block', fontSize: 'var(--cx-fs-small)' }}>
                      {dateTimeFmt.format(h.at)} · {MEMBERSHIP_STATUS[h.to]?.label ?? h.to}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </span>
                  ))}
                </span>
                <span className={`cx-tag ${MEMBERSHIP_STATUS[m.status]?.tone ?? ''}`}>{MEMBERSHIP_STATUS[m.status]?.label}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'familia' ? (
        p.family.length === 0 ? (
          <Card title="Familia">
            <p className="cx-muted">No forma parte de un grupo familiar.</p>
          </Card>
        ) : (
          p.family.map((g) => (
            <Card key={g.id} title={g.name}>
              <div className="rows">
                {g.members.map((m) => (
                  <div key={m.personId}>
                    <span className="grow">
                      <Link className="cx-link" href={`/admin/personas/${m.personId}`}>
                        {m.firstName} {m.lastName}
                      </Link>
                      <span className="cx-muted" style={{ display: 'block' }}>
                        {[m.relation, FAMILY_ROLE[m.role], m.age !== null ? `${m.age} años` : null, m.hasAccount ? 'tiene cuenta' : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {m.membership ? <span className="cx-tag cx-tag--ok">{m.membership.category}</span> : <span className="cx-tag">No socio</span>}
                  </div>
                ))}
              </div>
            </Card>
          ))
        )
      ) : null}

      {tab === 'roles' ? (
        <div className="cx-columns">
          <Card title="Roles y alcance">
            {p.roles.length === 0 ? <p className="cx-muted">No tiene roles asignados.</p> : null}
            <div className="rows">
              {p.roles.map((r) => (
                <div key={r.id}>
                  <span className="grow">
                    <strong>{r.roleName}</strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {r.scope} · desde {dateFmt.format(r.since)}
                    </span>
                  </span>
                  {assign && (r.roleCode !== 'superadmin' || superadmin) ? <RemoveRoleButton personId={id} assignmentId={r.id} label={`${r.roleName} (${r.scope})`} /> : null}
                </div>
              ))}
            </div>
            <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
              Socio no es un rol: sale de la membresía vigente.
            </p>
          </Card>
          {assign ? (
            <Card title="Asignar un rol">
              <AssignRoleForm personId={id} roles={superadmin ? roles : roles.filter((r) => r.code !== 'superadmin')} known={known} />
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === 'credenciales' ? (
        <div className="cx-columns">
          <Card title="Cuenta de la app">
            {p.account ? (
              <>
                <div className="kv">
                  <span>Usuario</span>
                  <b>{p.account.login}</b>
                </div>
                <div className="kv">
                  <span>Estado</span>
                  <b>{ACCOUNT_STATUS[p.account.status]}</b>
                </div>
                <div className="kv">
                  <span>Último ingreso</span>
                  <b>{p.account.lastLoginAt ? dateTimeFmt.format(p.account.lastLoginAt) : 'Nunca'}</b>
                </div>
              </>
            ) : manage ? (
              <InviteAccount personId={id} email={p.email} />
            ) : (
              <p className="cx-muted">No tiene cuenta en la app.</p>
            )}
          </Card>
          <Card title="Carnets">
            {p.credentials.length === 0 ? <p className="cx-muted">{current?.status === 'active' ? 'El carnet se emite la primera vez que lo abre en la app.' : 'Sin membresía vigente: no tiene carnet.'}</p> : null}
            <div className="rows">
              {p.credentials.map((c) => (
                <div key={c.id}>
                  <span className="grow">
                    <strong>Carnet social</strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      Emitido {dateFmt.format(c.validFrom)}
                      {c.revokedReason ? ` · revocado: ${c.revokedReason}` : ''}
                    </span>
                  </span>
                  <span className={`cx-tag ${c.status === 'active' ? 'cx-tag--ok' : 'cx-tag--bad'}`}>{c.status === 'active' ? 'Vigente' : 'Revocado'}</span>
                  {manage && c.status === 'active' ? <RevokeCredential credentialId={c.id} /> : null}
                </div>
              ))}
            </div>
            <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
              Revocar invalida el código actual; la persona recibe uno nuevo al volver a abrir su carnet.
            </p>
          </Card>
        </div>
      ) : null}

      {tab === 'historial' ? (
        <Card title="Historial">
          {p.history.length === 0 ? <p className="cx-muted">Sin cambios registrados.</p> : null}
          <div className="rows">
            {p.history.map((h, i) => (
              <div key={i}>
                <span className="grow">
                  <strong>{ACTION[h.action] ?? h.action}</strong>
                  <span className="cx-muted" style={{ display: 'block' }}>
                    {describe(h.diff)}
                  </span>
                </span>
                <span className="cx-muted">
                  {h.actor ?? 'Sistema'} · {dateTimeFmt.format(h.at)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
        La información clínica no se muestra en esta ficha, y la cuenta corriente está en Finanzas: cada una tiene su permiso.
      </p>
    </AppShell>
  );
}
