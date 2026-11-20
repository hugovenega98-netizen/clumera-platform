import Link from 'next/link';
import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';

/**
 * Marco de las pantallas públicas sin sesión (reservar sin cuenta): barra con la identidad del club
 * y el acceso a «Ingresar». Mobile first; en escritorio el contenido se abre en dos columnas.
 */
export function PublicShell({ children, next }: { children: ReactNode; next: string }) {
  return (
    <div className="pub-shell">
      <header className="pub-bar">
        <Link href="/reservar" className="pub-bar__brand">
          {/* Recurso del club, servido desde public/. */}
          <img src={clientConfig.assets.emblem} alt="" width={36} height={36} />
          <strong>{clientConfig.identity.displayName}</strong>
        </Link>
        <Link className="cx-btn cx-btn--secondary" href={`/ingresar?next=${encodeURIComponent(next)}`}>
          Ingresar
        </Link>
      </header>
      <main className="pub-main cx-stack">{children}</main>
    </div>
  );
}
