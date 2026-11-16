import { InstallApp } from '@clumera/ui';
import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';

/**
 * Marco de las pantallas sin sesión, con la identidad del club. En el teléfono: una tarjeta.
 * En escritorio, con `login.layout = "split"`: panel de marca a la izquierda y el formulario a la derecha.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  const split = clientConfig.login.layout === 'split';
  return (
    <main className={split ? 'cx-auth cx-auth--split' : 'cx-auth'}>
      <section className="cx-auth__hero" aria-label={clientConfig.identity.displayName}>
        {/* Recurso del club, servido desde public/: sin optimización de imagen. */}
        <img src={clientConfig.assets.emblemOnDark} alt="" width={72} height={72} />
        <h2>{clientConfig.identity.displayName}</h2>
        <p>{clientConfig.identity.tagline}</p>
      </section>
      <div className="cx-auth__side">
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
          <InstallApp appName={clientConfig.pwa.shortName} variant="secondary" className="cx-auth__install" />
        </div>
      </div>
    </main>
  );
}
