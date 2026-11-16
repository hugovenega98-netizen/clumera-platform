import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import { clientConfig } from '@/lib/client-config';

export const metadata: Metadata = { title: 'Sin conexión' };

export default function OfflinePage() {
  return (
    <main className="cx-page cx-stack">
      <Card title="Estás sin conexión">
        <p>No pudimos conectarnos con {clientConfig.identity.displayName}. Revisá tu conexión y volvé a intentar.</p>
        <p>Lo que ya abriste antes sigue disponible.</p>
      </Card>
    </main>
  );
}
