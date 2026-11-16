import '@clumera/ui/styles.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = { title: { default: 'Clumera Management', template: '%s · Clumera Management' }, robots: { index: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-AR">
      <body>{children}</body>
    </html>
  );
}
