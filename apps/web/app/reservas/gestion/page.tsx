import { clubDayOf } from '@clumera/agenda';
import { formatMoney } from '@clumera/finance';
import { bookingTitle, dayBookings, refundsDue } from '@clumera/module-bookings';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { BookingActions } from '@/components/BookingForms';
import { requireAdmin } from '@/lib/admin';
import { managedVenues, sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Reservas del día' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  held: { label: 'Esperando el pago', tone: 'cx-tag--warn' },
  confirmed: { label: 'Confirmada', tone: 'cx-tag--ok' },
  cancelled: { label: 'Cancelada', tone: '' },
  expired: { label: 'Liberada sin pago', tone: '' },
  conflict: { label: 'Pago tardío', tone: 'cx-tag--bad' },
};
const PAY: Record<string, string> = { full: 'pago completo', deposit: 'seña', club: 'paga en el club' };
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Reservas de un día para el encargado: quién, estado y pago; cancelar avisa a la persona. */
export default async function BookingsAdminPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  await requireModulePage('bookings');
  const { session, can } = await requireAdmin('/reservas/gestion', 'bookings:manage');
  const q = await searchParams;
  const today = clubDayOf(new Date()).day;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.dia ?? '') ? q.dia! : today;
  await sweepHolds();
  const db = getPrisma();
  const venues = await managedVenues(session.personId, 'bookings:manage');
  const [rows, refunds] = await Promise.all([
    dayBookings(
      db,
      day,
      venues.map((v) => v.id),
    ),
    can('finance:report.view') || can('bookings:manage') ? refundsDue(db) : [],
  ]);
  const now = new Date();
  return (
    <AppShell session={session} current="/reservas/gestion" title="Reservas del día" space="admin">
      <header className="agenda-bar">
        <h1>Reservas del día</h1>
        <nav className="day-nav" aria-label="Día">
          <Link className="cx-btn cx-btn--secondary" href={`/reservas/gestion?dia=${plus(day, -1)}`} aria-label="Día anterior">
            ‹
          </Link>
          <b>{((t) => t.charAt(0).toUpperCase() + t.slice(1))(new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)))}</b>
          <Link className="cx-btn cx-btn--secondary" href={`/reservas/gestion?dia=${plus(day, 1)}`} aria-label="Día siguiente">
            ›
          </Link>
        </nav>
      </header>
      <div className="cx-columns">
        <section className="cx-stack" aria-label="Reservas">
          {rows.length === 0 ? <p className="cx-muted">Sin reservas este día.</p> : null}
          {rows.map((b) => {
            const title = bookingTitle(b.venue.name, b.startsAt);
            return (
              <Card key={b.id} aria-label={`Reserva ${title}`}>
                <div className="team-card__head">
                  <h2 className="cx-card__title" style={{ margin: 0 }}>
                    {title}
                  </h2>
                  <span className={`cx-tag ${STATUS[b.status]?.tone ?? ''}`}>{STATUS[b.status]?.label}</span>
                </div>
                <p className="cx-muted">
                  {b.person.firstName} {b.person.lastName} · {formatMoney(b.price)} · {PAY[b.payMode]}
                  {b.refundDue ? ` · reintegro ${formatMoney(b.refundDue)}` : ''}
                </p>
                <BookingActions id={b.id} chargeId={null} payable={false} cancellable={(b.status === 'confirmed' || b.status === 'held') && b.startsAt > now} title={title} manager />
              </Card>
            );
          })}
        </section>
        <Card title="Reintegros pendientes">
          <p className="cx-muted">Cancelaciones a tiempo y pagos que llegaron tarde. Los devuelve Contabilidad.</p>
          {refunds.length ? (
            <div className="rows">
              {refunds.map((r) => (
                <div key={r.id}>
                  <span className="grow">
                    {r.person.firstName} {r.person.lastName}
                    <span className="cx-muted"> · {bookingTitle(r.venue.name, r.startsAt)}</span>
                  </span>
                  <b>{formatMoney(r.refundDue)}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="cx-muted">No hay.</p>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
