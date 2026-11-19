import { catalog } from '@clumera/catalog';
import type { ModuleId } from '@clumera/kernel';
import { accountFor, formatMoney } from '@clumera/finance';
import { membershipActive } from '@clumera/identity';
import { myTeams } from '@clumera/sports';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Icon, NAV_ICON } from '@/components/icons';
import { ADMIN_ENTRY } from '@/lib/admin';
import { permissionChecker } from '@/lib/authz';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getLicenseState } from '@/lib/license';
import { navigationFor } from '@/lib/navigation';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const TZ = 'America/Argentina/Buenos_Aires';
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: TZ });
const hour = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
const ddmm = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const SOURCE: Record<string, string> = { finance: 'Pagos', sports: 'Deportes', identity: 'Mi club', notifications: 'Avisos' };

function whenLabel(d: Date, now: Date) {
  if (dayKey.format(d) === dayKey.format(now)) return 'Hoy';
  const w = weekday.format(d).replace('.', '');
  return w.charAt(0).toUpperCase() + w.slice(1, 3);
}
function ago(d: Date, now: Date) {
  const m = Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));
  if (m < 1) return 'recién';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return h < 48 ? 'ayer' : `hace ${Math.round(h / 24)} días`;
}

/**
 * Inicio del socio (lienzo «Inicio del socio», móvil y escritorio): carnet, lo que vence, lo
 * próximo de la persona y su familia, accesos a los módulos habilitados y los últimos avisos.
 */
export default async function HomePage() {
  const session = await requireSession('/');
  const db = getPrisma();
  const now = new Date();
  const { enabled } = await getLicenseState();
  const visible = clientConfig.modules.visible;
  const items = [...navigationFor('member', catalog, enabled, visible), ...navigationFor('sports', catalog, enabled, visible)];
  const has = (id: ModuleId) => enabled.has(id);
  const can = await permissionChecker(session.personId);
  const admin = ADMIN_ENTRY.some((p) => can(p));
  const [membership, account, teams, recent] = await Promise.all([
    db.clubMembership.findFirst({ where: { personId: session.personId }, orderBy: { validFrom: 'desc' }, include: { category: true } }),
    has('finance') ? accountFor(db, session.personId, now) : null,
    has('sports') ? myTeams(db, session.personId, now) : [],
    db.notification.findMany({ where: { personId: session.personId }, orderBy: { createdAt: 'desc' }, take: 3 }),
  ]);

  const active = membershipActive(membership ?? undefined, now);
  const pending = (account?.people ?? [])
    .flatMap((p) => p.groups.flatMap((g) => g.charges.filter((c) => c.status === 'pending' && c.outstanding > 0).map((c) => ({ ...c, who: p.isSelf ? '' : p.firstName }))))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const due = pending[0];
  const upcoming = teams
    .filter((t) => t.nextMatch)
    .map((t) => ({ t, m: t.nextMatch! }))
    .sort((a, b) => a.m.startsAt.getTime() - b.m.startsAt.getTime())
    .slice(0, 4);
  // Carnet, Pagos y Avisos ya están en el dock y la campana (como en el lienzo): acá, el resto.
  const DOCKED = new Set(['/carnet', '/pagos', '/avisos', '/']);
  const shortcuts = items.filter((i) => !DOCKED.has(i.href));

  const carnet = (
    <Link href="/carnet" className="home-card" aria-label="Mi carnet">
      <span className="home-card__info">
        <span className="home-card__kicker">{membership?.memberNumber ? `Socio N° ${membership.memberNumber}` : clientConfig.identity.displayName}</span>
        <span className="home-card__title">{membership ? membership.category.name : 'Sin membresía'}</span>
        <span>
          <span className={`cx-tag ${active ? 'cx-tag--ok' : 'cx-tag--warn'}`}>{active ? '● Membresía vigente' : 'Sin membresía vigente'}</span>
        </span>
      </span>
      <span className="home-card__qr" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 3h7v7H3zm2 2v3h3V5zm9-2h7v7h-7zm2 2v3h3V5zM3 14h7v7H3zm2 2v3h3v-3zm9-2h2v2h-2zm2 2h2v2h-2zm2-2h3v2h-3zm-4 4h2v3h-2zm4 0h3v3h-3z" />
        </svg>
      </span>
    </Link>
  );

  return (
    <AppShell session={session} current="/" title="Inicio">
      <h1>Hola, {session.firstName}</h1>
      <div className="home">
        <div className="home__main">
          <div className="home__top">
            {carnet}
            {due ? (
              <section className={`home-due${due.overdue ? ' home-due--late' : ''}`} aria-label="Próximo vencimiento">
                <div className="home-due__text">
                  <strong>
                    {due.who ? `${due.who} · ` : ''}
                    {due.description}
                  </strong>
                  <span>
                    {formatMoney(due.outstanding)} · {due.overdue ? `venció el ${ddmm.format(due.dueDate)}` : `vence el ${ddmm.format(due.dueDate)}`}
                    {pending.length > 1 ? ` · y ${pending.length - 1} más` : ''}
                  </span>
                </div>
                <Link className="cx-btn cx-btn--primary" href="/pagos">
                  Pagar
                </Link>
              </section>
            ) : null}
          </div>

          <section className="cx-card home-list" aria-label="Próximo">
            <h2 className="home-sec">Próximo</h2>
            {upcoming.length ? (
              upcoming.map(({ t, m }) => {
                const answer = m.status === 'scheduled' && m.response === 'pending';
                const sub = answer ? `Convocatoria · confirmá asistencia` : `${t.sportName} · ${t.teamName}${m.venue ? ` · ${m.venue}` : ''}`;
                return (
                  <Link key={`${m.id}:${t.person.id}`} className="home-row" href={m.status === 'live' ? `/vivo/${m.id}` : '/deportes'}>
                    <span className="home-row__when">
                      {whenLabel(m.startsAt, now)}
                      <b>{hour.format(m.startsAt)}</b>
                    </span>
                    <span className="home-row__body">
                      <strong>
                        {t.person.isSelf ? '' : `${t.person.firstName} · `}Partido vs. {m.opponent}
                      </strong>
                      <span className="cx-muted">{sub}</span>
                    </span>
                    {m.status === 'live' ? (
                      <span className="cx-tag cx-tag--bad">En vivo</span>
                    ) : answer ? (
                      <span className="cx-tag cx-tag--warn">Responder</span>
                    ) : m.response === 'going' ? (
                      <span className="cx-tag cx-tag--ok">Voy</span>
                    ) : t.person.isSelf ? (
                      <span className="cx-tag cx-tag--info">Deporte</span>
                    ) : (
                      <span className="cx-tag">Familia</span>
                    )}
                  </Link>
                );
              })
            ) : (
              <p className="cx-muted">No tenés nada programado por ahora.</p>
            )}
          </section>
        </div>

        <div className="home__side">
          <section className="home-quick" aria-label="Accesos">
            <h2 className="home-sec">Accesos</h2>
            <nav aria-label="Secciones del club">
              <ul className="home-quick__grid">
                {shortcuts.map((item) => (
                  <li key={`${item.moduleId}:${item.id}`}>
                    <Link className="home-qa" href={item.href}>
                      <span className="home-qa__icon">
                        <Icon name={NAV_ICON[`${item.moduleId}:${item.id}`] ?? 'more'} size={24} />
                      </span>
                      {item.label}
                    </Link>
                  </li>
                ))}
                {admin ? (
                  <li>
                    <Link className="home-qa" href="/admin" aria-label="Ir al inicio institucional">
                      <span className="home-qa__icon">
                        <Icon name="chart" size={24} />
                      </span>
                      Administración
                    </Link>
                  </li>
                ) : null}
              </ul>
            </nav>
          </section>

          <section className="cx-card home-list home-notices" aria-label="Últimos avisos">
            <div className="home-notices__head">
              <h2 className="home-sec">Últimos avisos</h2>
              <Link className="cx-link" href="/avisos">
                Ver todos
              </Link>
            </div>
            {recent.length ? (
              recent.map((n) => (
                <Link key={n.id} className="home-notice" href={n.url ?? '/avisos'}>
                  <span className={`home-notice__dot${n.readAt ? ' home-notice__dot--read' : ''}`} aria-hidden="true" />
                  <span>
                    <strong>{n.title}</strong>
                    <span className="cx-muted">
                      {SOURCE[n.source] ?? n.source} · {ago(n.createdAt, now)}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <p className="cx-muted">No tenés avisos todavía.</p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
