import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@clumera/ui/styles.css';
import './lab.css';
import { INSTALL_CAPTURE_SCRIPT } from '@clumera/ui';
import type { Metadata, Viewport } from 'next';
import { clientConfig } from '@/lab';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: 'Clumera Lab', robots: { index: false, follow: false } };

export const viewport: Viewport = { themeColor: clientConfig.colors.theme, width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function LabLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <head>
        {/* Lab se instala como la app del club de Lab: manifiesto e íconos los sirve el core (mismo origen). */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href={clientConfig.assets.appleTouchIcon} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={clientConfig.pwa.shortName} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
