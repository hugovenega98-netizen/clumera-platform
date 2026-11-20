import { formatMoney } from '@clumera/finance';
import { pickupsFor } from '@clumera/identity';
import { campAdmin } from '@clumera/module-summer';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ReviewDocument } from '@/components/CampForms';
import { requireAdmin } from '@/lib/admin';
import { CAMP_STATUS, DOC_STATUS } from '@/lib/camp-labels';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Colonia' };
export const dynamic = 'force-dynamic';

/**
 * Coordinación de la colonia (lienzo «Colonia de vacaciones»): grupos con cupo, indicadores,
 * inscripciones con su documentación por revisar y quiénes pueden retirar a cada chico. El apto
 * físico solo se abre con el permiso de datos de salud.
 */
export default async function CampAdminPage() {
  await requireModulePage('summer');
  const { session, can } = await requireAdmin('/admin/verano', 'summer:manage');
  const db = getPrisma();
  const { programs, rows, kpis } = await campAdmin(db);
  const health = can('summer:document.sensitive.view');
  const docs = await db.enrollmentDocument.findMany({
    where: { enrollmentId: { in: rows.map((r) => r.id) } },
    include: { requirement: { select: { label: true, sensitive: true, sortOrder: true } }, file: { select: { id: true, filename: true } } },
    orderBy: { requirement: { sortOrder: 'asc' } },
  });
  const pickups = await pickupsFor(db, rows.map((r) => r.person.id));
  return (
    <AppShell session={session} current="/admin/verano" title="Colonia" space="admin">
      <h1>Colonia de vacaciones</h1>
      <div className="reception__counts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="kpi">
          <span className="cx-muted">Inscriptos confirmados</span>
          <b>
            {kpis.confirmed} / {kpis.capacity}
          </b>
        </div>
        <div className="kpi">
          <span className="cx-muted">Pendientes de pago</span>
          <b>{kpis.pendingPayment}</b>
        </div>
        <div className="kpi">
          <span className="cx-muted">Lista de espera</span>
          <b>{kpis.waitlist}</b>
        </div>
        <div className="kpi">
          <span className="cx-muted">Documentación incompleta</span>
          <b>{kpis.docsIncomplete}</b>
        </div>
      </div>
      <div className="cx-columns">
        <section className="cx-stack" aria-label="Inscripciones">
          {rows.length === 0 ? <p className="cx-muted">Todavía no hay inscripciones.</p> : null}
          {rows.map((r) => {
            const st = CAMP_STATUS[r.status]!;
            const mine = docs.filter((d) => d.enrollmentId === r.id);
            return (
              <Card key={r.id} aria-label={`Colonia de ${r.person.firstName} ${r.person.lastName}`}>
                <div className="team-card__head">
                  <strong>
                    {r.person.firstName} {r.person.lastName}
                  </strong>
                  <span className={`cx-tag ${st.tone}`}>
                    {st.label}
                    {r.status === 'waitlist' ? ` · ${r.waitPosition}°` : ''}
                  </span>
                </div>
                <p className="cx-muted">
                  {r.group.name} · {formatMoney(r.fee)} · {r.paid ? 'pago acreditado' : 'pago pendiente'}
                  {r.docsMissing ? ` · faltan ${r.docsMissing} documentos aprobados` : ' · documentación completa'}
                </p>
                {mine.length ? (
                  <ul className="doc-list">
                    {mine.map((d) => (
                      <li key={d.id}>
                        <span className={`cx-tag ${DOC_STATUS[d.status]!.tone}`} aria-hidden="true">
                          {DOC_STATUS[d.status]!.mark}
                        </span>
                        <span className="grow">
                          {d.requirement.label}
                          <span className="cx-muted" style={{ display: 'block' }}>
                            {DOC_STATUS[d.status]!.label}
                            {d.note ? ` · ${d.note}` : ''}
                          </span>
                          {!d.requirement.sensitive || health ? (
                            <a className="cx-link" href={`/api/files/${d.file.id}`} download>
                              Descargar {d.file.filename}
                            </a>
                          ) : (
                            <span className="cx-muted">Lo revisa la coordinación con permiso de salud.</span>
                          )}
                        </span>
                        {d.status === 'submitted' && (!d.requirement.sensitive || health) ? <ReviewDocument id={d.id} label={d.requirement.label} who={r.person.firstName} /> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="cx-muted">
                  Retiran:{' '}
                  {(pickups.get(r.person.id) ?? [])
                    .map((p) => `${p.name} (${p.relation}${p.docLast4 ? ` · DNI …${p.docLast4}` : ''})`)
                    .join(', ') || 'solo sus responsables'}
                </p>
              </Card>
            );
          })}
        </section>
        <aside className="cx-stack">
          {programs.map((p) => (
            <Card key={p.id} title={p.name}>
              <ul className="group-list">
                {p.groups.map((g) => (
                  <li key={g.id}>
                    <div className="group-row">
                      <span className="grow">
                        <strong>{g.name}</strong>
                        <span className="cx-muted" style={{ display: 'block' }}>
                          {g.schedule}
                          {g.place ? ` · ${g.place}` : ''}
                        </span>
                      </span>
                      <span className="capacity capacity--inline" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, Math.round((g.taken / g.capacity) * 100))}%` }} />
                      </span>
                      <span className="cx-tag">
                        {g.taken} / {g.capacity}
                        {g.waiting ? ` · ${g.waiting} en espera` : ''}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
                Cupos controlados: no se confirma por encima del cupo aunque lleguen dos a la vez.
              </p>
            </Card>
          ))}
        </aside>
      </div>
    </AppShell>
  );
}
