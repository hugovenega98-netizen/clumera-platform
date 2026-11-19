import { Card } from '@clumera/ui';
import Link from 'next/link';

export default function Forbidden() {
  return (
    <main className="cx-page cx-stack" style={{ maxWidth: 560, margin: '0 auto', paddingTop: 48 }}>
      <Card title="No tenés acceso a esta sección">
        <p>Tu cuenta no tiene permiso para ver esta pantalla. Si creés que es un error, pedile a la administración del club que revise tus roles.</p>
        <Link className="cx-link" href="/">
          Volver al inicio
        </Link>
      </Card>
    </main>
  );
}
