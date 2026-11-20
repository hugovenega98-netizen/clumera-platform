import { formatMoney } from '@clumera/finance';
import { campFee, campIneligible, campPrograms, familyCampEnrollments } from '@clumera/module-summer';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CampEnrollButton } from '@/components/CampForms';
import { CAMP_STATUS } from '@/lib/camp-labels';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { manageablePeople } from '@/lib/schools-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Colonia de verano' };
export const dynamic = 'force-dynamic';

/**
 * Colonia de verano (lienzo «Inscripción a colonia», paso 1): la familia elige grupo para cada chico.
 * El lugar queda tomado; se confirma con los documentos aprobados y el pago.
 */
export default async function SummerPage() {
  await requireModulePage('summer');
  const session = await requireSession('/verano');
  const db = getPrisma();
  const people = await manageablePeople(session.personId);
  const familyIds = people.map((p) => p.id);
  const [programs, enrollments] = await Promise.all([campPrograms(db), familyCampEnrollments(db, familyIds)]);
  return (
    <AppShell session={session} current="/verano" title="Colonia de verano">
      <h1>Colonia de verano</h1>
      {enrollments.length ? (
        <section className="cx-stack" aria-label="Inscripciones de la familia">
          <h2 className="home-sec">Inscripciones de la familia</h2>
          {enrollments.map((e) => (
            <Link key={e.id} className="home-row" href={`/verano/inscripcion/${e.id}`} aria-label={`Colonia de ${e.person.firstName}: ${CAMP_STATUS[e.status]?.label ?? ''}`}>
              <span className="enroll-row__avatar" aria-hidden="true">
                {`${e.person.firstName.charAt(0)}${e.person.lastName.charAt(0)}`.toUpperCase()}
              </span>
              <span className="home-row__body">
                <strong>
                  {e.person.firstName} · {e.group.name}
                </strong>
                <span className="cx-muted">
                  {e.group.program.name} · {formatMoney(e.fee)}
                  {e.status === 'waitlist' ? ` · puesto ${e.waitPosition}` : ''}
                </span>
              </span>
              <span className={`cx-tag ${CAMP_STATUS[e.status]?.tone ?? ''}`}>{CAMP_STATUS[e.status]?.label}</span>
            </Link>
          ))}
        </section>
      ) : null}
      {programs.length === 0 ? <p className="cx-muted">La colonia todavía no abrió la inscripción.</p> : null}
      {await Promise.all(
        programs.map(async (p) => {
          const rows = await Promise.all(
            people.map(async (person) => ({ person, why: await campIneligible(db, p, person.id), fee: await campFee(db, p, person.id, familyIds), current: enrollments.find((e) => e.person.id === person.id && e.group.program.slug === p.slug) })),
          );
          const kids = rows.filter((r) => !r.why || r.current);
          return (
            <Card key={p.id} aria-label={p.name}>
              <h2 className="cx-card__title" style={{ margin: 0 }}>
                {p.name}
              </h2>
              <p className="cx-muted">
                {p.description ? `${p.description} · ` : ''}De {p.minAge ?? 0} a {p.maxAge ?? 99} años · {formatMoney(p.memberFee)} socio · {formatMoney(p.guestFee)} general
                {p.familyDiscountPercent ? ` · ${p.familyDiscountPercent}% de descuento desde el segundo hermano` : ''}
              </p>
              <p className="cx-muted">Documentos: {p.documents.map((d) => d.label).join(', ')}.</p>
              {kids.length === 0 ? <p className="cx-muted">Nadie de tu familia a cargo tiene la edad de la colonia.</p> : null}
              {kids.map(({ person, fee, current }) => (
                <div key={person.id} className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
                  <strong>
                    {person.firstName} {person.lastName}
                  </strong>
                  {current ? (
                    <Link className="cx-link" href={`/verano/inscripcion/${current.id}`}>
                      Inscripta en {current.group.name}: completar documentos y pago
                    </Link>
                  ) : (
                    <div className="rows">
                      {p.groups.map((g) => (
                        <div key={g.id}>
                          <span className="grow">
                            {g.name}
                            <span className="cx-muted" style={{ display: 'block' }}>
                              {g.schedule}
                              {g.place ? ` · ${g.place}` : ''} · {g.free ? `${g.free} lugares` : `completo · ${g.waiting} en espera`} · {formatMoney(fee.fee)}
                              {fee.discount ? ` (con ${fee.discount}% familiar)` : ''}
                            </span>
                          </span>
                          <CampEnrollButton groupId={g.id} personId={person.id} who={person.firstName} waitlist={g.free === 0} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </Card>
          );
        }),
      )}
    </AppShell>
  );
}
