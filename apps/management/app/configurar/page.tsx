import { Card, Notice } from '@clumera/ui';
import { SetupForm } from './SetupForm';

export const dynamic = 'force-dynamic';

/** Primer uso de Management: elegir la contraseña de administración sin que pase por nadie más. */
export default function SetupPage() {
  const configured = Boolean(process.env.MANAGEMENT_ADMIN_PASSWORD_HASH?.trim());
  return (
    <main className="cx-auth">
      <div className="cx-auth__panel">
        <Card title="Configurar Management">
          {configured ? (
            <Notice tone="ok">La contraseña de administración ya está configurada. Ingresá desde la pantalla de acceso.</Notice>
          ) : (
            <>
              <p>
                Administración: <strong>{process.env.MANAGEMENT_ADMIN_EMAIL ?? '(falta MANAGEMENT_ADMIN_EMAIL)'}</strong>. Elegí la contraseña: se calcula su hash
                para cargarlo en Vercel; no se guarda en ningún lado.
              </p>
              <SetupForm />
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
