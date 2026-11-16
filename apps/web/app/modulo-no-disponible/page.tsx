import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'No disponible' };

export default function ModuleUnavailablePage() {
  return (
    <main className="cx-page cx-stack">
      <Card title="Esta sección no está disponible">
        <p>El club no tiene habilitada esta función.</p>
        <Link className="cx-btn cx-btn--secondary" href="/">
          Volver al inicio
        </Link>
      </Card>
    </main>
  );
}
