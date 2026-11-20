import { clubDayOf } from '@clumera/agenda';
import { formatMoney } from '@clumera/finance';
import { availability, bookingTitle, payOptions } from '@clumera/module-bookings';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { GuestBookingForm } from '@/components/PublicBookingForms';
import { PublicShell } from '@/components/PublicShell';
import { sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { getCurrentSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Reservar sin cuenta' };
export const dynamic = 'force-dynamic';

const hhmm = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

/** Datos de contacto y pago online (seña o total) para reservar sin cuenta. */
export default async function PublicConfirmPage({ searchParams }: { searchParams: Promise<{ espacio?: string; inicio?: string }> }) {
  await requireModulePage('bookings');
  const q = await searchParams;
  if (await getCurrentSession()) redirect(`/reservas/confirmar?espacio=${encodeURIComponent(q.espacio ?? '')}&inicio=${encodeURIComponent(q.inicio ?? '')}`);
  const startsAt = new Date(q.inicio ?? '');
  if (!q.espacio || Number.isNaN(startsAt.getTime())) notFound();
  await sweepHolds();
  const db = getPrisma();
  const venue = await db.venue.findUnique({ where: { id: q.espacio }, include: { rule: true } });
  if (!venue?.active || !venue.rule?.publicBooking) notFound();
  const day = clubDayOf(startsAt).day;
  const slot = (await availability(db, venue.id, day, false))?.find((s) => s.startsAt.getTime() === startsAt.getTime());
  const back = `/reservar?grupo=${encodeURIComponent(venue.group)}&espacio=${venue.id}&dia=${day}`;
  const options = slot?.price ? payOptions(slot.price, venue.rule).filter((o) => o.mode !== 'club' && o.available) : [];
  return (
    <PublicShell next={`/reservas/confirmar?espacio=${venue.id}&inicio=${encodeURIComponent(startsAt.toISOString())}`}>
      <nav aria-label="Ruta">
        <Link className="cx-link" href={back}>
          ← Volver a los horarios
        </Link>
      </nav>
      <h1>Reservá sin cuenta</h1>
      {!slot || slot.state !== 'free' || !slot.price || options.length === 0 ? (
        <Card title="Ese turno ya no está libre">
          <p className="cx-muted">Alguien lo tomó o cambió la agenda. Elegí otro horario.</p>
          <Link className="cx-btn cx-btn--primary" href={back}>
            Ver horarios
          </Link>
        </Card>
      ) : (
        <div className="booking-layout booking-layout--public">
          <Card title="Tus datos">
            <GuestBookingForm venueId={venue.id} startsAt={startsAt.toISOString()} options={options} cancelHours={venue.rule.cancelHours} holdMinutes={venue.rule.holdMinutes} />
          </Card>
          <Card title={bookingTitle(venue.name, startsAt)} aria-label="Resumen de la reserva">
            <p className="cx-muted">
              {hhmm.format(slot.startsAt)} a {hhmm.format(slot.endsAt)} · {venue.group}
              {venue.detail ? ` · ${venue.detail}` : ''}
            </p>
            <div className="kv">
              <span>Tarifa general</span>
              <b>{formatMoney(slot.price)}</b>
            </div>
            {options.find((o) => o.mode === 'deposit') ? (
              <div className="kv">
                <span>Seña para confirmar ({venue.rule.depositPercent}%)</span>
                <b>{formatMoney(options.find((o) => o.mode === 'deposit')!.amount)}</b>
              </div>
            ) : null}
            <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
              ¿Sos socio?{' '}
              <Link className="cx-link" href={`/ingresar?next=${encodeURIComponent(`/reservas/confirmar?espacio=${venue.id}&inicio=${startsAt.toISOString()}`)}`}>
                Ingresá
              </Link>{' '}
              para tarifa socio.
            </p>
          </Card>
        </div>
      )}
    </PublicShell>
  );
}
