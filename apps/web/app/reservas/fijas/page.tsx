import { clubDayOf } from '@clumera/agenda';
import { searchPeople } from '@clumera/identity';
import { listBookingSeries, MAX_SERIES_WEEKS } from '@clumera/module-bookings';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CancelSeries, SeriesForm } from '@/components/SeriesForms';
import { requireAdmin } from '@/lib/admin';
import { managedVenues } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { docPepper } from '@/lib/people-api';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Reservas fijas' };
export const dynamic = 'force-dynamic';

const dmy = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

/**
 * Reservas fijas del encargado: el mismo turno todas las semanas entre dos fechas (a pagar en el club).
 * Las semanas ocupadas no se reservan y se informan al cargar.
 */
export default async function BookingSeriesPage({ searchParams }: { searchParams: Promise<{ q?: string; persona?: string }> }) {
  await requireModulePage('bookings');
  const { session } = await requireAdmin('/reservas/fijas', 'bookings:manage');
  const sp = await searchParams;
  const q = (sp.q ?? '').slice(0, 100);
  const db = getPrisma();
  const venues = (await managedVenues(session.personId, 'bookings:manage')).filter((v) => v.active);
  const withRule = await db.bookingRule.findMany({ where: { venueId: { in: venues.map((v) => v.id) } } });
  const rules = new Map(withRule.map((r) => [r.venueId, r]));
  const bookable = venues.filter((v) => rules.has(v.id));
  const [series, found, person] = await Promise.all([
    listBookingSeries(
      db,
      venues.map((v) => v.id),
    ),
    q ? searchPeople(db, { q, pepper: docPepper() }) : null,
    sp.persona ? db.person.findUnique({ where: { id: sp.persona }, select: { id: true, firstName: true, lastName: true } }) : null,
  ]);
  const today = clubDayOf(new Date()).day;
  return (
    <AppShell session={session} current="/reservas/fijas" title="Reservas fijas" space="admin">
      <h1>Reservas fijas</h1>
      <div className="cx-columns">
        <section className="cx-stack" aria-label="Reservas fijas vigentes">
          {series.length === 0 ? <p className="cx-muted">No hay reservas fijas vigentes.</p> : null}
          {series.map((s) => (
            <Card key={s.id} aria-label={`Reserva fija ${s.venueName} ${s.when}`}>
              <div className="team-card__head">
                <h2 className="cx-card__title" style={{ margin: 0 }}>
                  {s.venueName} · {s.when}
                </h2>
                <span className="cx-tag cx-tag--ok">Fija</span>
              </div>
              <p className="cx-muted">
                {s.label}
                {s.label !== s.person ? ` · ${s.person}` : ''} · del {dmy(s.fromDay)} al {dmy(s.untilDay)} · {s.upcoming} {s.upcoming === 1 ? 'semana pendiente' : 'semanas pendientes'}
                {s.next ? ` · próxima ${s.next.split(' · ')[1]}` : ''}
              </p>
              {s.upcoming ? <CancelSeries id={s.id} title={`${s.venueName} ${s.when}`} weeks={s.upcoming} /> : null}
            </Card>
          ))}
        </section>
        <Card title="Nueva reserva fija">
          <form className="search-row" role="search" action="/reservas/fijas">
            <input className="cx-input" type="search" name="q" defaultValue={q} aria-label="Buscar persona" placeholder="Nombre, DNI o N° de socio…" />
            <button className="cx-btn cx-btn--secondary" type="submit">
              Buscar
            </button>
          </form>
          {found ? (
            <div className="rows">
              {found.items.slice(0, 8).map((p) => (
                <div key={p.id}>
                  <span className="grow">
                    {p.lastName}, {p.firstName}
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {p.memberNumber ? `N° ${p.memberNumber}` : 'No socio'}
                    </span>
                  </span>
                  <Link className="cx-btn cx-btn--secondary" href={`/reservas/fijas?persona=${p.id}`} aria-label={`Elegir a ${p.firstName} ${p.lastName}`}>
                    Elegir
                  </Link>
                </div>
              ))}
              {found.items.length === 0 ? <p className="cx-muted">Sin resultados.</p> : null}
            </div>
          ) : null}
          {person ? (
            bookable.length ? (
              <SeriesForm
                person={{ id: person.id, name: `${person.firstName} ${person.lastName}` }}
                venues={bookable.map((v) => ({ id: v.id, name: v.name, openFrom: rules.get(v.id)!.openFrom, openTo: rules.get(v.id)!.openTo, slotMinutes: rules.get(v.id)!.slotMinutes }))}
                today={today}
                maxWeeks={MAX_SERIES_WEEKS}
              />
            ) : (
              <p className="cx-muted">No administrás espacios con reglas de reserva.</p>
            )
          ) : (
            <p className="cx-muted">Buscá a la persona y elegila para cargar el turno semanal. Se cobra en el club, semana por semana.</p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
