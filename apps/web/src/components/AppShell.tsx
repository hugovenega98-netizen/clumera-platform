import { catalog } from '@clumera/catalog';
import type { SessionInfo } from '@clumera/identity';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { getLicenseState } from '@/lib/license';
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

/** Dock del teléfono: Inicio + hasta tres secciones principales + Más. */
function dockItems(nav: NavLink[]): NavLink[] {
  const preferred = ['identity:card', 'bookings:book', 'finance:payments', 'sports:my-sports'];
  const main = preferred.map((k) => nav.find((n) => n.key === k)).filter((n): n is NavLink => Boolean(n)).slice(0, 3);
  return [{ key: 'home', href: '/', label: 'Inicio', icon: 'home' }, ...main, { key: 'more', href: '/cuenta', label: 'Más', icon: 'more' }];
}

const isCurrent = (href: string, current: string) => (href === '/' ? current === '/' : current === href || current.startsWith(`${href}/`));

/**
 * Marco de las pantallas con sesión. Mobile first: barra superior + dock inferior dentro de la PWA.
 * En escritorio (≥ 981 px) el dock pasa a menú lateral con todas las secciones y la barra queda arriba
 * del contenido. Solo aparecen los módulos encendidos y visibles; esconder no es autorizar.
 */
export async function AppShell({ children, session, current, title }: { children: ReactNode; session: SessionInfo; current: string; title: string }) {
  const nav = await memberNav();
  const unread = await getPrisma().notification.count({ where: { personId: session.personId, readAt: null } });
  const aria = (href: string) => (isCurrent(href, current) ? { 'aria-current': 'page' as const } : {});
  return (
    <div className="cx-shell">
      <aside className="cx-shell__side" aria-label="Menú">
        <Link href="/" className="cx-topbar__brand">
          <img src={clientConfig.assets.emblemOnDark} alt="" width={32} height={32} />
          {clientConfig.identity.displayName}
        </Link>
        <nav className="cx-side-nav" aria-label="Secciones">
          <Link href="/" {...aria('/')}>
            <Icon name="home" />
            Inicio
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
          <Link href="/cuenta" {...aria('/cuenta')}>
            <Icon name="more" />
            Mi cuenta
          </Link>
        </nav>
      </aside>
      <header className="cx-topbar cx-shell__top">
        <Link href="/" className="cx-topbar__brand">
          <img src={clientConfig.assets.emblemOnDark} alt="" width={32} height={32} />
          <span className="cx-sr-only">{clientConfig.identity.displayName} · </span>
          <span>{title}</span>
        </Link>
        <span className="cx-shell__title" aria-hidden="true">
          {title}
        </span>
        <div className="cx-topbar__actions">
          <Link href="/avisos" className="cx-iconbtn" aria-label={unread ? `Avisos, ${unread} sin leer` : 'Avisos'}>
            <Icon name="bell" />
            {unread ? <span className="cx-iconbtn__badge">{unread > 99 ? '99+' : unread}</span> : null}
          </Link>
          <Link href="/cuenta" className="cx-link">
            {session.firstName}
          </Link>
        </div>
      </header>
      <div className="cx-shell__main">
        <main className="cx-page cx-stack">{children}</main>
      </div>
      <nav className="cx-dock" aria-label="Navegación principal">
        {dockItems(nav).map((n) => (
          <Link key={n.key} href={n.href} {...aria(n.href)}>
            <Icon name={n.icon} size={24} />
            {n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
