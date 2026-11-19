import { catalog } from '@clumera/catalog';
import type { SessionInfo } from '@clumera/identity';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getLicenseState } from '@/lib/license';
import { permissionChecker } from '@/lib/authz';
import { navigationFor } from '@/lib/navigation';
import { Icon, NAV_ICON } from './icons';

interface NavLink {
  key: string;
  href: string;
  label: string;
  icon: string;
}

/** Ítems del socio y de sus deportes: solo módulos encendidos y visibles para el club. */
async function memberNav(): Promise<NavLink[]> {
  const { enabled } = await getLicenseState();
  const visible = clientConfig.modules.visible;
  return [...navigationFor('member', catalog, enabled, visible), ...navigationFor('sports', catalog, enabled, visible)]
    .filter((n) => n.href !== '/avisos')
    .map((n) => ({ key: `${n.moduleId}:${n.id}`, href: n.href, label: n.label, icon: NAV_ICON[`${n.moduleId}:${n.id}`] ?? 'more' }));
}

/** Áreas de la institución que la persona puede abrir: el menú pregunta a can() por cada una. */
async function adminNav(personId: string): Promise<NavLink[]> {
  const { enabled } = await getLicenseState();
  const can = await permissionChecker(personId);
  return navigationFor('admin', catalog, enabled, clientConfig.modules.visible)
    .filter((n) => !n.permission || can(n.permission))
    .map((n) => ({ key: `${n.moduleId}:${n.id}`, href: n.href, label: n.label, icon: NAV_ICON[`${n.moduleId}:${n.id}`] ?? 'more' }));
}

/** Dock del teléfono: Inicio + hasta tres secciones principales + Más. */
function dockItems(nav: NavLink[], home: string): NavLink[] {
  const preferred = ['identity:card', 'bookings:book', 'finance:payments', 'sports:my-sports', 'identity:people', 'finance:accounting'];
  const main = preferred.map((k) => nav.find((n) => n.key === k)).filter((n): n is NavLink => Boolean(n)).slice(0, 3);
  return [{ key: 'home', href: home, label: 'Inicio', icon: 'home' }, ...main, { key: 'more', href: '/espacios', label: 'Más', icon: 'more' }];
}

const isCurrent = (href: string, current: string) => (href === '/' || href === '/admin' ? current === href : current === href || current.startsWith(`${href}/`));

/**
 * Marco de las pantallas con sesión. Mobile first: barra superior + dock inferior dentro de la PWA.
 * En escritorio (≥ 981 px) el dock pasa a menú lateral con todas las secciones y la barra queda arriba
 * del contenido. Solo aparecen los módulos encendidos y visibles; esconder no es autorizar.
 */
export async function AppShell({
  children,
  session,
  current,
  title,
  space = 'member',
}: {
  children: ReactNode;
  session: SessionInfo;
  current: string;
  title: string;
  /** `admin`: áreas de la institución (inicio institucional, padrón…); `member`: Mi club. */
  space?: 'member' | 'admin';
}) {
  const admin = space === 'admin';
  const home = admin ? '/admin' : '/';
  const nav = admin ? await adminNav(session.personId) : await memberNav();
  const unread = await getPrisma().notification.count({ where: { personId: session.personId, readAt: null } });
  const aria = (href: string) => (isCurrent(href, current) ? { 'aria-current': 'page' as const } : {});
  return (
    <div className="cx-shell">
      <aside className="cx-shell__side" aria-label="Menú">
        <Link href={home} className="cx-topbar__brand">
          <img src={clientConfig.assets.emblemOnDark} alt="" width={32} height={32} />
          {clientConfig.identity.displayName}
        </Link>
        <nav className="cx-side-nav" aria-label={admin ? 'Áreas de la institución' : 'Secciones'}>
          <Link href={home} {...aria(home)}>
            <Icon name="home" />
            {admin ? 'Inicio institucional' : 'Inicio'}
          </Link>
          {nav.map((n) => (
            <Link key={n.key} href={n.href} {...aria(n.href)}>
              <Icon name={n.icon} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="cx-side__label">Cuenta</div>
        <nav className="cx-side-nav" aria-label="Cuenta">
          <Link href="/avisos" {...aria('/avisos')}>
            <Icon name="bell" />
            Avisos
          </Link>
          {admin ? (
            <Link href="/">
              <Icon name="swap" />
              Ir a Mi club
            </Link>
          ) : null}
          <Link href="/espacios" {...aria('/espacios')}>
            <Icon name="family" />
            Mis espacios
          </Link>
          <Link href="/cuenta" {...aria('/cuenta')}>
            <Icon name="more" />
            Mi cuenta
          </Link>
        </nav>
      </aside>
      <header className="cx-topbar cx-shell__top">
        {/* Móvil (lienzo): emblema, club y pantalla; cambiar de espacio y avisos. */}
        <Link href={home} className="cx-topbar__brand">
          <img src={clientConfig.assets.emblemOnDark} alt="" width={36} height={36} />
          <span className="cx-topbar__titles">
            <span className="cx-topbar__kicker">{clientConfig.identity.displayName}</span>
            <span className="cx-sr-only"> · </span>
            <span className="cx-topbar__title">{title}</span>
          </span>
        </Link>
        <span className="cx-shell__title" aria-hidden="true">
          {title}
        </span>
        <div className="cx-topbar__actions">
          <Link href="/espacios" className="cx-iconbtn cx-topbar__mobile" aria-label="Cambiar de espacio">
            <Icon name="swap" />
          </Link>
          <Link href="/avisos" className="cx-iconbtn" aria-label={unread ? `Avisos, ${unread} sin leer` : 'Avisos'}>
            <Icon name="bell" />
            {unread ? <span className="cx-iconbtn__badge">{unread > 99 ? '99+' : unread}</span> : null}
          </Link>
          {/* Escritorio (lienzo): avatar y nombre, a Mi cuenta. En el teléfono la cuenta está en «Más». */}
          <Link href="/cuenta" className="cx-topbar__me">
            <span className="cx-topbar__avatar" aria-hidden="true">
              {session.firstName.charAt(0).toUpperCase()}
            </span>
            {session.firstName}
          </Link>
        </div>
      </header>
      <div className="cx-shell__main">
        <main className="cx-page cx-stack">{children}</main>
      </div>
      <nav className="cx-dock" aria-label="Navegación principal">
        {dockItems(nav, home).map((n) => (
          <Link key={n.key} href={n.href} {...(n.key === 'more' && current === '/cuenta' ? { 'aria-current': 'page' as const } : aria(n.href))}>
            <Icon name={n.icon} size={24} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
