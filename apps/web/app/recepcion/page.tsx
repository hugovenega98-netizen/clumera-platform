import { listAccessPoints, pointSummary } from '@clumera/module-access';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ReceptionDesk } from '@/components/ReceptionDesk';
import { permissionChecker } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Recepción' };
export const dynamic = 'force-dynamic';

const hhmm = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

/**
 * Recepción (lienzo «Recepción · control de acceso»): escanear o tipear el QR, o buscar a la persona;
 * resultado grande con validez, motivo y nombre —nunca deuda ni salud— y los últimos intentos.
 */
export default async function ReceptionPage({ searchParams }: { searchParams: Promise<{ punto?: string }> }) {
  await requireModulePage('access');
  const session = await requireSession('/recepcion');
  const can = await permissionChecker(session.personId);
  if (!can('access:validate')) forbidden();
  const db = getPrisma();
  const points = await listAccessPoints(db);
  const q = await searchParams;
  const point = points.find((p) => p.slug === q.punto) ?? points[0];
  const summary = point && can('access:log.view') ? await pointSummary(db, point.id) : null;
  return (
    <AppShell session={session} current="/recepcion" title="Recepción" space="admin">
      <header className="agenda-bar">
        <div>
          <span className="reception__kicker">Recepción · punto de acceso</span>
          <h1>{point?.name ?? 'Recepción'}</h1>
        </div>
        {points.length > 1 ? (
          <div className="chip-row" role="group" aria-label="Punto de acceso">
            {points.map((p) => (
              <Link key={p.id} className="chip chip--small" href={`/recepcion?punto=${p.slug}`} aria-pressed={p.id === point?.id}>
                {p.name}
              </Link>
            ))}
          </div>
        ) : null}
      </header>
      {!point ? (
        <p className="cx-muted">El club todavía no tiene puntos de acceso.</p>
      ) : (
        <div className="reception">
          <ReceptionDesk pointId={point.id} canOverride={can('access:override')} />
          {summary ? (
            <aside className="cx-stack reception__side" aria-label="Resumen del puesto">
              <div className="reception__counts">
                <div className="kpi">
                  <span className="cx-muted">Ingresos hoy</span>
                  <b>{summary.granted}</b>
                </div>
                <div className="kpi">
                  <span className="cx-muted">Rechazos hoy</span>
                  <b>{summary.denied}</b>
                </div>
              </div>
              <section className="cx-card" aria-label="Últimos intentos">
                <h2 className="home-sec" style={{ margin: 0 }}>
                  Últimos intentos
                </h2>
                {summary.recent.length === 0 ? <p className="cx-muted">Todavía no hubo intentos en este punto.</p> : null}
                <ul className="attempt-log">
                  {summary.recent.map((a) => (
                    <li key={a.id}>
                      <span className={`attempt-log__dot attempt-log__dot--${a.granted ? 'ok' : 'bad'}`} aria-hidden="true" />
                      <span className="grow">
                        <span className="cx-sr-only">{a.granted ? 'Permitido: ' : 'Denegado: '}</span>
                        {a.text}
                      </span>
                      <time className="cx-muted" dateTime={a.at.toISOString()}>
                        {hhmm.format(a.at)}
                      </time>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
