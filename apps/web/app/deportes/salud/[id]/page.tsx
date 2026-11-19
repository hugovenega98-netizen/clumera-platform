import { injuryHistory, medicalQueue } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EvaluationForm } from '@/components/HealthForms';
import { AVAILABILITY_LABEL, STATUS_LABEL } from '@/lib/health-labels';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { healthTeams } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Seguimiento' };
export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const stamp = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires' });

/** Seguimiento clínico (solo Médico/Kine con `sports:health.view` en el deporte del equipo). */
export default async function InjuryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession(`/deportes/salud/${id}`);
  const db = getPrisma();
  const report = await db.injuryReport.findUnique({ where: { id }, select: { teamId: true } });
  if (!report) notFound();
  const teams = await healthTeams(session.personId);
  if (!teams.some((t) => t.id === report.teamId)) forbidden();
  const r = (await medicalQueue(db, [report.teamId])).find((x) => x.id === id)!;
  const history = await injuryHistory(db, id, true);
  return (
    <AppShell session={session} current="/deportes" title="Seguimiento">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/deportes/salud">
          ← Consultorio
        </Link>
      </nav>
      <header>
        <h1>{r.personName}</h1>
        <p className="cx-muted">
          {r.team} · {STATUS_LABEL[r.status]} · {AVAILABILITY_LABEL[r.availability]}
        </p>
      </header>
      <div className="cx-columns">
        <div className="cx-stack">
          <Card title="Reporte">
            {[
              ['Zona', r.zone],
              ['Dolor', `${r.pain} de 10`],
              ['Dónde pasó', r.context],
              ['Cuánto limita', r.impact],
              ['Desde', day.format(r.onsetDate)],
            ].map(([k, v]) => (
              <div className="kv" key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
            {r.notes ? <p>{r.notes}</p> : null}
          </Card>
          <Card title={`Historial · ${history.length}`}>
            {history.length ? (
              <ol className="rows">
                {history.map((s) => (
                  <li key={s.id}>
                    <span className="grow">
                      <strong>{stamp.format(s.createdAt)}</strong> · {s.authorName} · {STATUS_LABEL[s.status]}, {AVAILABILITY_LABEL[s.availability]?.toLowerCase()}
                      {s.publicNote ? <div>Indicaciones: {s.publicNote}</div> : null}
                      {s.privateNote ? <div className="cx-muted">Nota privada: {s.privateNote}</div> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="cx-muted">Sin evaluaciones todavía.</p>
            )}
          </Card>
        </div>
        <Card title="Nueva evaluación">
          {r.status === 'closed' ? (
            <p className="cx-muted">El seguimiento está finalizado. Si vuelve a molestar, la persona informa un reporte nuevo.</p>
          ) : (
            <EvaluationForm reportId={r.id} status={r.status} availability={r.availability} publicNote={r.publicNote} />
          )}
        </Card>
      </div>
    </AppShell>
  );
}
