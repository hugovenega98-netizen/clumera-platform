import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';

/** Marco de las pantallas sin sesión, con la identidad del club. */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="cx-auth">
      <div className="cx-auth__panel cx-card cx-stack">
        <div className="cx-auth__brand">
          <img src={clientConfig.assets.emblem} alt="" width={48} height={48} />
          <div>
            <strong>{clientConfig.identity.displayName}</strong>
            <div className="cx-muted">{clientConfig.identity.tagline}</div>
          </div>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
