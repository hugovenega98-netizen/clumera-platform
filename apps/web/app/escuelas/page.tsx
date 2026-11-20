import { formatMoney } from '@clumera/finance';
import { familyEnrollments, openPrograms } from '@clumera/module-schools';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { WithdrawEnrollment } from '@/components/SchoolForms';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { manageablePeople } from '@/lib/schools-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Actividades' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: (pos: number | null) => string; tone: string }> = {
  confirmed: { label: () => 'Confirmada', tone: 'cx-tag--ok' },
  pending: { label: () => 'Pendiente', tone: 'cx-tag--warn' },
  waitlist: { label: (p) => `Espera · ${p ?? '—'}°`, tone: 'cx-tag--info' },
};
const initials = (p: { firstName: string; lastName: string }) => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();

/**
 * Actividades (lienzo «Actividades»): inscripciones del grupo familiar y propuestas abiertas. Se
 * filtra por persona; inscribe la persona o su responsable.
 */
export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ para?: string }> }) {
  await requireModulePage('schools');
  const session = await requireSession('/escuelas');
  const db = getPrisma();
  const people = await manageablePeople(session.personId);
  const q = await searchParams;
  const only = people.find((p) => p.id === q.para);
  const [enrollments, programs] = await Promise.all([familyEnrollments(db, only ? [only.id] : people.map((p) => p.id)), openPrograms(db)]);
  return (
    <AppShell session={session} current="/escuelas" title="Actividades">
      <h1>Actividades</h1>
      {people.length > 1 ? (
        <div className="chip-row" role="group" aria-label="Para quién">
          <Link className="chip chip--small" href="/escuelas" aria-pressed={!only}>
            Todos
          </Link>
          {people.map((p) => (
            <Link key={p.id} className="chip chip--small" href={`/escuelas?para=${p.id}`} aria-pressed={only?.id === p.id}>
              {p.isSelf ? 'Yo' : p.firstName}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="cx-columns">
        <section className="cx-stack" aria-label="Inscripciones">
          <h2 className="home-sec">{people.length > 1 ? 'Inscripciones del grupo familiar' : 'Mis inscripciones'}</h2>
          {enrollments.length === 0 ? <p className="cx-muted">Todavía no hay inscripciones. Elegí una propuesta abierta.</p> : null}
          {enrollments.map((e) => {
            const st = STATUS[e.status]!;
            const who = people.find((p) => p.id === e.person.id);
            return (
              <Card key={e.id} aria-label={`Inscripción ${e.group.program.name} · ${e.person.firstName}`}>
                <div className="enroll-row">
                  <span className="enroll-row__avatar" aria-hidden="true">
                    {initials(e.person)}
                  </span>
                  <div className="grow">
                    <strong>
                      {e.group.program.name} · {e.group.name}
                    </strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {who?.isSelf ? 'Vos' : e.person.firstName} · {e.group.schedule}
                      {e.group.place ? ` · ${e.group.place}` : ''}
                      {e.group.teacherName ? ` · Prof. ${e.group.teacherName}` : ''}
                    </span>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      Cuota {formatMoney(e.fee)} por mes · {e.memberRate ? 'tarifa socio' : 'tarifa general'}
                    </span>
                  </div>
                  <span className={`cx-tag ${st.tone}`}>{st.label(e.waitPosition)}</span>
                </div>
                <WithdrawEnrollment id={e.id} title={`${e.group.program.name} · ${e.person.firstName}`} waiting={e.status === 'waitlist'} />
              </Card>
            );
          })}
        </section>
        <section className="cx-stack" aria-label="Inscripciones abiertas">
          <h2 className="home-sec">Inscripciones abiertas</h2>
          {programs.length === 0 ? <p className="cx-muted">No hay inscripciones abiertas por ahora.</p> : null}
          <div className="offer-grid">
            {programs.map((p) => {
              const free = p.groups.reduce((n, g) => n + g.free, 0);
              return (
                <Link key={p.id} className="offer" href={`/escuelas/${p.slug}`}>
                  <span className={`cx-tag ${free ? 'cx-tag--info' : 'cx-tag--warn'}`}>{free ? `${free} ${free === 1 ? 'cupo' : 'cupos'}` : 'Lista de espera'}</span>
                  <strong>{p.name}</strong>
                  <span className="cx-muted">
                    {p.minAge !== null || p.maxAge !== null ? `${p.minAge ?? 0} a ${p.maxAge ?? 99} años · ` : ''}
                    {p.groups.length} {p.groups.length === 1 ? 'grupo' : 'grupos'}
                    {p.membersOnly ? ' · solo socios' : ''}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
