import { formatMoney } from '@clumera/finance';
import { eligibility, programBySlug } from '@clumera/module-schools';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { EnrollButton } from '@/components/SchoolForms';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { manageablePeople } from '@/lib/schools-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Inscripción' };
export const dynamic = 'force-dynamic';

/** Una propuesta: sus grupos con cupo y, para cada persona de la familia, si puede inscribirse. */
export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireModulePage('schools');
  const { slug } = await params;
  const session = await requireSession(`/escuelas/${slug}`);
  const db = getPrisma();
  const program = await programBySlug(db, slug);
  if (!program || program.status !== 'open') notFound();
  const people = await manageablePeople(session.personId);
  const [eligible, current] = await Promise.all([
    Promise.all(people.map(async (p) => ({ ...p, ...(await eligibility(db, program, p.id)) }))),
    db.enrollment.findMany({ where: { personId: { in: people.map((p) => p.id) }, groupId: { in: program.groups.map((g) => g.id) }, status: { not: 'withdrawn' } }, select: { groupId: true, personId: true, status: true, waitPosition: true } }),
  ]);
  return (
    <AppShell session={session} current="/escuelas" title={program.name}>
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/escuelas">
          ← Actividades
        </Link>
      </nav>
      <h1>{program.name}</h1>
      <p className="cx-muted">
        {program.description ? `${program.description} · ` : ''}
        {program.minAge !== null || program.maxAge !== null ? `De ${program.minAge ?? 0} a ${program.maxAge ?? 99} años · ` : ''}
        Cuota {formatMoney(program.memberFee)} socio · {formatMoney(program.guestFee)} general{program.feeKind === 'monthly' ? ' (por mes)' : ''}
        {program.membersOnly ? ' · solo socios' : ''}
      </p>
      <div className="cx-stack">
        {program.groups.map((g) => (
          <Card key={g.id} aria-label={`Grupo ${g.name}`}>
            <div className="team-card__head">
              <h2 className="cx-card__title" style={{ margin: 0 }}>
                {g.name}
              </h2>
              <span className={`cx-tag ${g.free ? 'cx-tag--ok' : 'cx-tag--warn'}`}>{g.free ? `${g.free} de ${g.capacity} libres` : `Completo · ${g.waiting} en espera`}</span>
            </div>
            <p className="cx-muted">
              {g.schedule}
              {g.place ? ` · ${g.place}` : ''}
              {g.teacherName ? ` · Prof. ${g.teacherName}` : ''}
            </p>
            <div className="capacity" aria-hidden="true">
              <span style={{ width: `${Math.min(100, Math.round((g.taken / g.capacity) * 100))}%` }} />
            </div>
            <div className="rows">
              {eligible.map((p) => {
                const mine = current.find((c) => c.groupId === g.id && c.personId === p.id);
                return (
                  <div key={p.id}>
                    <span className="grow">
                      {p.isSelf ? 'Yo' : `${p.firstName} ${p.lastName}`}
                      <span className="cx-muted" style={{ display: 'block' }}>
                        {mine ? (mine.status === 'waitlist' ? `En espera · ${mine.waitPosition}°` : 'Inscripto') : p.ok ? `${formatMoney(p.fee)} por mes · ${p.member ? 'tarifa socio' : 'tarifa general'}` : p.reason}
                      </span>
                      {/* La confirmación queda escrita en la fila (no depende del botón, que ya no está). */}
                      {mine ? (
                        <span className={`callup-status callup-status--${mine.status === 'waitlist' ? 'warn' : 'ok'}`} role="status" style={{ display: 'block', marginTop: 6 }}>
                          {mine.status === 'waitlist' ? `Quedó en lista de espera (puesto ${mine.waitPosition}). Te avisamos si se libera un lugar.` : 'Inscripción confirmada. La cuota del mes está en Pagos.'}
                        </span>
                      ) : null}
                    </span>
                    {!mine && p.ok ? <EnrollButton groupId={g.id} personId={p.id} who={p.isSelf ? 'mí' : p.firstName} waitlist={g.free === 0} /> : null}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
