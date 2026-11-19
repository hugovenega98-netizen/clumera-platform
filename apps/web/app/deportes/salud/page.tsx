import { medicalQueue, myInjuries, myTeams } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { InjuryReportForm } from '@/components/HealthForms';
import { AVAILABILITY_LABEL, STATUS_LABEL } from '@/lib/health-labels';
import { getPrisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { healthTeams } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Salud' };
export const dynamic = 'force-dynamic';

const day = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const tone = (a: string) => (a === 'no_restrictions' ? 'ok' : a === 'unavailable' ? 'bad' : a === 'restricted' ? 'warn' : 'info');

/**
 * Salud deportiva. La persona y su familia ven sus reportes, el estado, la disponibilidad y las
 * indicaciones. Médico/Kine ve además la bandeja de su deporte. El coach no entra acá: solo ve la
 * disponibilidad en el plantel.
 */
export default async function HealthPage() {
  const session = await requireSession('/deportes/salud');
  const db = getPrisma();
  const [teams, clinical] = await Promise.all([myTeams(db, session.personId), healthTeams(session.personId)]);
  const people = [...new Set(teams.map((t) => t.person.id))];
  const [mine, queue] = await Promise.all([people.length ? myInjuries(db, people) : [], medicalQueue(db, clinical.map((t) => t.id))]);
  const options = teams.map((t) => ({ personId: t.person.id, teamId: t.teamId, label: `${t.person.isSelf ? 'Yo' : t.person.firstName} · ${t.sportName} ${t.teamName}` }));
  const open = queue.filter((q) => q.status !== 'closed');
  return (
    <AppShell session={session} current="/deportes" title="Salud">
      <h1>Salud</h1>
      {clinical.length ? (
        <Card title={`Consultorio · ${open.length} ${open.length === 1 ? 'seguimiento abierto' : 'seguimientos abiertos'}`}>
          <p className="cx-muted">{[...new Set(clinical.map((t) => t.sport.name))].join(', ')}. Solo Médico/Kine ve este listado.</p>
          {queue.length ? (
            <div className="rows" role="list" aria-label="Seguimientos">
              {queue.map((q) => (
                <div key={q.id} role="listitem">
                  <span className="grow">
                    <Link className="cx-link" href={`/deportes/salud/${q.id}`}>
                      {q.personName}
                    </Link>
                    <span className="cx-muted">
                      {' '}
                      · {q.team} · {q.zone} · dolor {q.pain}/10
                    </span>
                  </span>
                  <span className={`cx-tag cx-tag--${tone(q.availability)}`}>{AVAILABILITY_LABEL[q.availability]}</span>
                  <span className="cx-tag">{STATUS_LABEL[q.status]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="cx-muted">Sin reportes.</p>
          )}
        </Card>
      ) : null}
      <div className="cx-columns">
        <section className="cx-stack" aria-label="Mis reportes">
          <h2>Mis reportes</h2>
          {mine.length === 0 ? <p className="cx-muted">No hay lesiones informadas.</p> : null}
          {mine.map((r) => (
            <Card key={r.id} aria-label={`Reporte ${r.zone}`}>
              <div className="team-card__head">
                <h3 className="cx-card__title" style={{ margin: 0 }}>
                  {r.zone}
                </h3>
                <span className={`cx-tag cx-tag--${tone(r.availability)}`}>{AVAILABILITY_LABEL[r.availability]}</span>
              </div>
              <p className="cx-muted">
                {people.length > 1 ? `${r.personName} · ` : ''}
                {r.team} · desde {day.format(r.onsetDate)} · {STATUS_LABEL[r.status]}
              </p>
              {r.publicNote ? (
                <p>
                  <strong>Indicaciones:</strong> {r.publicNote}
                </p>
              ) : null}
              {r.sessions.length ? (
                <details>
                  <summary className="cx-link">Historial ({r.sessions.length})</summary>
                  <ol className="rows">
                    {r.sessions.map((s) => (
                      <li key={s.id}>
                        <span className="grow">
                          {day.format(s.createdAt)} · {s.authorName}: {STATUS_LABEL[s.status]}, {AVAILABILITY_LABEL[s.availability]?.toLowerCase()}
                          {s.publicNote ? ` — ${s.publicNote}` : ''}
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
            </Card>
          ))}
        </section>
        {options.length ? (
          <Card title="Informar una lesión o molestia">
            <p className="cx-muted">Lo recibe Médico/Kine de tu deporte. El coach solo ve si estás disponible, nunca el detalle.</p>
            <InjuryReportForm options={options} />
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
