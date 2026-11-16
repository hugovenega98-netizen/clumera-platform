import Link from 'next/link';
import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';

/** Marco de las pantallas con sesión. La navegación completa llega con las 28 pantallas del Hito A. */
export function AppShell({ children, firstName }: { children: ReactNode; firstName: string }) {
  return (
    <>
      <header className="cx-topbar">
        <Link href="/" className="cx-link">
          {clientConfig.identity.displayName}
        </Link>
        <Link href="/cuenta" className="cx-link">
          {firstName}
        </Link>
      </header>
      <main className="cx-page cx-stack">{children}</main>
    </>
  );
}
