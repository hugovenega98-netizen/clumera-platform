import { Button, Card, Notice } from '@clumera/ui';
import Link from 'next/link';
import { LAB_PROFILES } from '@/profiles';

export const dynamic = 'force-dynamic';

export default async function LabHome({ searchParams }: { searchParams: Promise<{ restaurado?: string; error?: string }> }) {
  const { restaurado, error } = await searchParams;
  return (
    <main className="cx-page cx-stack">
      <header>
        <h1>Clumera Lab</h1>
        <p>Un club integral con datos de prueba. Elegí un perfil para entrar a la app como esa persona.</p>
      </header>
      {restaurado ? <Notice tone="ok">Lab volvió a los datos base.</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <Card title="Entrar como">
        <ul className="cx-list" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {LAB_PROFILES.map((p) => (
            <li key={p.key}>
              <form method="post" action="/lab/api/login-as">
                <input type="hidden" name="profile" value={p.key} />
                <Button type="submit" variant="secondary" block>
                  {p.label}
                </Button>
                <div className="cx-muted">
                  {p.firstName} {p.lastName} · {p.description}
                </div>
              </form>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Herramientas">
        <div className="cx-stack">
          <Link className="cx-btn cx-btn--secondary" href="/correo">
            Ver correos enviados (activación y recuperación)
          </Link>
          <Link className="cx-btn cx-btn--secondary" href="/ingresar" prefetch={false}>
            Ir al ingreso normal
          </Link>
          <form method="post" action="/lab/api/restore">
            <Button type="submit" variant="danger" block>
              Restaurar datos base
            </Button>
          </form>
          <p className="cx-muted">Restaurar borra todo lo creado en la demo y vuelve al estado inicial. Solo afecta a la base de Lab.</p>
        </div>
      </Card>
    </main>
  );
}
