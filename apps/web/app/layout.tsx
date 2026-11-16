import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@clumera/ui/styles.css';
import './app.css';
import { clientCssText } from '@clumera/config';
import { INSTALL_CAPTURE_SCRIPT } from '@clumera/ui';
import { SerwistProvider } from '@serwist/turbopack/react';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { clientConfig } from '@/lib/client-config';

const cfg = clientConfig;

export const metadata: Metadata = {
  title: { default: cfg.identity.displayName, template: `%s · ${cfg.identity.displayName}` },
  description: cfg.pwa.description,
  applicationName: cfg.pwa.name,
  appleWebApp: { capable: true, title: cfg.pwa.shortName, statusBarStyle: 'default' },
  icons: { icon: cfg.assets.favicon, apple: cfg.assets.appleTouchIcon },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: cfg.colors.theme,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={cfg.locale.language}>
      <head>
        {/* Identidad del club como variables --client-*: los componentes nunca fijan colores propios. */}
        <style id="client-branding">{clientCssText(cfg)}</style>
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>
        <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === 'development'}>
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
