import { clubDayOf } from '@clumera/agenda';
import { formatMoney } from '@clumera/finance';
import { availability, bookingTitle, isMember, payOptions } from '@clumera/module-bookings';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { BookingCheckout } from '@/components/BookingForms';
import { permissionChecker } from '@/lib/authz';
import { sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Confirmar reserva' };
export const dynamic = 'force-dynamic';

const hhmm = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

/** Confirmar y pagar (lienzo «Reservas · confirmar y pagar»): resumen, tarifa y forma de pago. */
export default async function ConfirmBookingPage({ searchParams }: { searchParams: Promise<{ espacio?: string; inicio?: string }> }) {
  await requireModulePage('bookings');
  const q = await searchParams;
  const session = await requireSession(`/reservas/confirmar?espacio=${q.espacio ?? ''}&inicio=${encodeURIComponent(q.inicio ?? '')}`);
  if (!(await permissionChecker(session.personId))('bookings:book')) forbidden();
  const startsAt = new Date(q.inicio ?? '');
  if (!q.espacio || Number.isNaN(startsAt.getTime())) notFound();
  await sweepHolds();
  const db = getPrisma();
  const venue = await db.venue.findUnique({ where: { id: q.espacio }, include: { rule: true } });
  if (!venue?.rule) notFound();
  const member = await isMember(db, session.personId);
  const day = clubDayOf(startsAt).day;
  const slot = (await availability(db, venue.id, day, member))?.find((s) => s.startsAt.getTime() === startsAt.getTime());
  const back = `/reservas?grupo=${encodeURIComponent(venue.group)}&espacio=${venue.id}&dia=${day}`;
  return (
    <AppShell session={session} current="/reservas" title="Confirmar reserva">
      <nav aria-label="Ruta">
        <Link className="cx-link" href={back}>
          ← Volver al turnero
        </Link>
      </nav>
      <h1>Confirmar y pagar</h1>
      {!slot || slot.state !== 'free' || slot.price === null ? (
        <Card title="Ese turno ya no está libre">
          <p className="cx-muted">Alguien lo tomó o cambió la agenda. Elegí otro horario.</p>
          <Link className="cx-btn cx-btn--primary" href={back}>
            Ver horarios
          </Link>
        </Card>
      ) : (
        <div className="booking-layout">
          <Card title={bookingTitle(venue.name, startsAt)}>
            <p className="cx-muted">
              {hhmm.format(slot.startsAt)} a {hhmm.format(slot.endsAt)} · {venue.group}
              {venue.detail ? ` · ${venue.detail}` : ''}
            </p>
            <div className="kv">
              <span>{member ? 'Tarifa socio' : 'Tarifa no socio'}</span>
              <b>{formatMoney(slot.price)}</b>
            </div>
          </Card>
          <Card title="Forma de pago">
            <BookingCheckout
              venueId={venue.id}
              startsAt={startsAt.toISOString()}
              price={slot.price}
              options={payOptions(slot.price, venue.rule)}
              holdMinutes={venue.rule.holdMinutes}
              cancelHours={venue.rule.cancelHours}
            />
          </Card>
        </div>
      )}
    </AppShell>
  );
}
