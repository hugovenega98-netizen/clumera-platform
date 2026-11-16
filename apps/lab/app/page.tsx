import { Button, Card, Notice } from '@clumera/ui';
import { LabShell } from '@/LabShell';
import { LAB_PROFILES } from '@/profiles';

export const dynamic = 'force-dynamic';

export default async function LabHome({ searchParams }: { searchParams: Promise<{ restaurado?: string; error?: string }> }) {
  const { restaurado, error } = await searchParams;
  return (
    <LabShell current="/">
      <header>
        <h1>Clumera Lab</h1>
        <p>Un club integral con datos de prueba. Elegí un perfil para entrar a la app como esa persona.</p>
      </header>
      {restaurado ? <Notice tone="ok">Lab volvió a los datos base.</Notice> : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <div className="cx-columns">
        <Card title="Entrar como">
          <ul className="lab-profiles">
            {LAB_PROFILES.map((p) => (
              <li key={p.key}>
                <div className="lab-profile">
                  <strong>{p.label}</strong>
                  <div className="cx-muted">
                    {p.firstName} {p.lastName} · {p.description}
                  </div>
                  <form method="post" action="/lab/api/login-as">
                    <input type="hidden" name="profile" value={p.key} />
                    <Button type="submit" variant="secondary" block aria-label={`Entrar como ${p.label}`}>
                      Entrar
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Herramientas">
          <div className="cx-stack">
            <a className="cx-btn cx-btn--secondary" href="/lab/permisos">
              Ver permisos por perfil
            </a>
            <a className="cx-btn cx-btn--secondary" href="/lab/correo">
              Ver correos enviados (activación y recuperación)
            </a>
            <a className="cx-btn cx-btn--secondary" href="/ingresar">
              Ir al ingreso normal
            </a>
            <form method="post" action="/lab/api/restore">
              <Button type="submit" variant="danger" block>
                Restaurar datos base
              </Button>
            </form>
            <p className="cx-muted">Restaurar borra todo lo creado en la demo y vuelve al estado inicial. Solo afecta a la base de Lab.</p>
          </div>
        </Card>
      </div>
    </LabShell>
  );
}
