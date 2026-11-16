import Link from 'next/link';
import type { ReactNode } from 'react';
import { clientConfig } from './lab';

const SECTIONS = [
  { href: '/', label: 'Perfiles' },
  { href: '/permisos', label: 'Permisos' },
  { href: '/correo', label: 'Correo' },
];

/**
 * Marco de Lab (bajo /lab). Mobile first: barra con la marca y las secciones en pestañas;
 * en escritorio el contenido se abre en columnas (ver cada página).
 */
export function LabShell({ current, children }: { current: string; children: ReactNode }) {
  return (
    <>
      <header className="lab-top">
        <div className="lab-top__row">
          <a href="/lab" className="cx-topbar__brand">
            {/* Recurso del club, servido por el core a través de Lab. */}
            <img src={clientConfig.assets.emblemOnDark} alt="" width={32} height={32} />
            {clientConfig.identity.displayName}
          </a>
          <a className="lab-top__app" href="/">
            Abrir la app
          </a>
        </div>
        <nav className="lab-tabs" aria-label="Secciones de Lab">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} aria-current={s.href === current ? 'page' : undefined}>
              {s.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="cx-page cx-stack lab-page">{children}</main>
    </>
  );
}
