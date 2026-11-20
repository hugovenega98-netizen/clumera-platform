import { formatMoney } from '@clumera/finance';
import { pickupsFor } from '@clumera/identity';
import { campChecklist } from '@clumera/module-summer';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { CampDetailsForm, CampDocumentUpload, CampPay, PickupForm, RevokePickup, WithdrawCamp } from '@/components/CampForms';
import { CAMP_STATUS, DOC_STATUS } from '@/lib/camp-labels';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { requireSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Colonia · documentación' };
export const dynamic = 'force-dynamic';

const dm = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });

/**
 * Inscripción a colonia de un chico (lienzo «Inscripción a colonia · documentación»): documentos,
 * quiénes pueden retirarlo, uso de imagen y contacto de emergencia, y pago. Se confirma sola cuando
 * la coordinación aprueba los documentos y se acredita el pago.
 */
export default async function CampEnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulePage('summer');
  const { id } = await params;
  const session = await requireSession(`/verano/inscripcion/${id}`);
  const db = getPrisma();
  const c = await campChecklist(db, id);
  if (!c || c.enrollment.status === 'withdrawn' || !(await actsFor(session.personId, c.enrollment.personId))) notFound();
  const e = c.enrollment;
  const pickups = (await pickupsFor(db, [e.personId])).get(e.personId) ?? [];
  const st = CAMP_STATUS[e.status]!;
  const due = c.charge && !c.paid ? c.charge.amount - c.charge.paidAmount : 0;
  return (
    <AppShell session={session} current="/verano" title="Colonia de verano">
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/verano">
          ← Colonia de verano
        </Link>
      </nav>
      <h1>Documentación</h1>
      <div className="cx-columns">
        <div className="cx-stack">
          <Card aria-label="Documentos requeridos">
            <h2 className="home-sec" style={{ margin: 0 }}>
              Documentos requeridos
            </h2>
            <ul className="doc-list">
              {c.docs.map((d) => {
                const s = DOC_STATUS[d.status]!;
                return (
                  <li key={d.id} aria-label={`${d.label}: ${s.label}`}>
                    <span className={`cx-tag ${s.tone}`} aria-hidden="true">
                      {s.mark}
                    </span>
                    <span className="grow">
                      {d.label}
                      <span className="cx-muted" style={{ display: 'block' }}>
                        {s.label}
                        {d.file ? ` · ${d.file.filename} · ${dm.format(d.file.createdAt)}` : ''}
                        {d.status === 'rejected' && d.note ? ` · ${d.note}` : ''}
                        {d.sensitive ? ' · solo lo ven coordinación y salud' : ''}
                      </span>
                    </span>
                    {d.status !== 'approved' && e.status !== 'waitlist' ? <CampDocumentUpload enrollmentId={e.id} code={d.code} label={d.label} replace={Boolean(d.file)} /> : null}
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card aria-label="Pueden retirarlo">
            <h2 className="home-sec" style={{ margin: 0 }}>
              Pueden retirar{e.person.firstName ? ` a ${e.person.firstName}` : ''}
            </h2>
            <div className="rows">
              {pickups.map((p) => (
                <div key={`${p.id ?? p.name}`}>
                  <span className="grow">
                    <strong>{p.name}</strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {p.relation}
                      {p.holder ? ' · responsable' : p.docLast4 ? ` · DNI terminado en ${p.docLast4}` : ''}
                    </span>
                  </span>
                  {p.holder ? <span className="cx-tag cx-tag--ok">Titular</span> : p.id ? <RevokePickup id={p.id} name={p.name} /> : null}
                </div>
              ))}
            </div>
            <PickupForm minorId={e.personId} />
          </Card>
        </div>
        <aside className="cx-stack">
          <Card aria-label={`Inscripción de ${e.person.firstName}`}>
            <div className="team-card__head">
              <strong>
                {e.person.firstName} {e.person.lastName}
              </strong>
              <span className={`cx-tag ${st.tone}`}>
                {st.label}
                {e.status === 'waitlist' ? ` · ${e.waitPosition}°` : ''}
              </span>
            </div>
            <p className="cx-muted">
              {e.group.program.name} · {e.group.name} · {e.group.schedule}
            </p>
            {e.status === 'pending' ? (
              <p className="callup-status callup-status--warn" role="status">
                {c.pendingDocs ? `Faltan ${c.pendingDocs} ${c.pendingDocs === 1 ? 'documento aprobado' : 'documentos aprobados'}` : 'Documentos aprobados'}
                {' · '}
                {c.paid ? 'pago acreditado' : 'falta el pago'}. Se confirma sola cuando esté todo.
              </p>
            ) : e.status === 'confirmed' ? (
              <p className="callup-status callup-status--ok" role="status">
                Inscripción confirmada: documentos aprobados y pago acreditado.
              </p>
            ) : (
              <p className="callup-status callup-status--warn" role="status">
                En lista de espera (puesto {e.waitPosition}). Si se libera un lugar te avisamos y completás documentos y pago.
              </p>
            )}
            <div className="kv">
              <span>Inscripción{e.fee < (e.memberRate ? e.group.program.memberFee : e.group.program.guestFee) ? ' · descuento familiar' : ''}</span>
              <b>{formatMoney(e.fee)}</b>
            </div>
            {due > 0 && c.charge ? <CampPay chargeId={c.charge.id} amount={due} /> : null}
            <WithdrawCamp id={e.id} name={e.person.firstName} waiting={e.status === 'waitlist'} />
          </Card>
          <Card aria-label="Salud y emergencias">
            <CampDetailsForm id={e.id} initial={{ imageConsent: e.imageConsent ?? false, emergencyName: e.emergencyName ?? '', emergencyPhone: e.emergencyPhone ?? '' }} />
            <p className="lock-note">Solo lo ven la coordinación y el equipo de salud.</p>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
