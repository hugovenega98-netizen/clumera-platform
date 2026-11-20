import { formatMoney } from '@clumera/finance';
import { bookingView } from '@clumera/module-bookings';
import { Card, Notice } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardQr } from '@/components/CardQr';
import { GuestBookingActions } from '@/components/PublicBookingForms';
import { PublicShell } from '@/components/PublicShell';
import { sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { bookingFromToken } from '@/lib/public-booking';
import { requireModulePage } from '@/lib/require-module';
import { getCredentials } from '@/lib/services';

export const metadata: Metadata = { title: 'Tu reserva', robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: string }> = {
  held: { label: 'Esperando el pago', tone: 'cx-tag--warn' },
  confirmed: { label: 'Confirmada', tone: 'cx-tag--ok' },
  cancelled: { label: 'Cancelada', tone: '' },
  expired: { label: 'Liberada sin pago', tone: '' },
  conflict: { label: 'Pago tardío · reintegro', tone: 'cx-tag--bad' },
};
const hhmm = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

/**
 * Reserva hecha sin cuenta, abierta con el enlace firmado del correo: estado, pago y cancelación.
 * Solo muestra lo de esa reserva (sin datos de contacto).
 */
export default async function GuestBookingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ pago?: string }> }) {
  await requireModulePage('bookings');
  const { token } = await params;
  const q = await searchParams;
  const id = bookingFromToken(token);
  if (!id) notFound();
  await sweepHolds();
  const now = new Date();
  const b = await bookingView(getPrisma(), id, now);
  if (!b?.public) notFound();
  const status = STATUS[b.status]!;
  const qr = b.status === 'confirmed' && b.endsAt > now ? await getCredentials().bookingQr(b.id) : null;
  const day = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  return (
    <PublicShell next="/reservas">
      <h1>Tu reserva</h1>
      {q.pago === '1' && b.status === 'held' ? <Notice tone="warn">Estamos esperando que Mercado Pago acredite el pago. Esta página se actualiza al recargarla.</Notice> : null}
      {q.pago === 'error' ? <Notice tone="bad">No pudimos abrir Mercado Pago. El turno queda retenido unos minutos: probá «Pagar ahora».</Notice> : null}
      <div className="booking-layout">
        <Card aria-label={`Reserva ${b.title}`}>
          <div className="team-card__head">
            <h2 className="cx-card__title" style={{ margin: 0 }}>
              {b.title}
            </h2>
            <span className={`cx-tag ${status.tone}`}>{status.label}</span>
          </div>
          <p className="cx-muted">
            {hhmm.format(b.startsAt)} a {hhmm.format(b.endsAt)} · {b.venue.group} · a nombre de {b.person.firstName}
          </p>
          <div className="kv">
            <span>Tarifa general</span>
            <b>{formatMoney(b.price)}</b>
          </div>
          {b.paid ? (
            <div className="kv">
              <span>Pagado</span>
              <b>{formatMoney(b.paid)}</b>
            </div>
          ) : null}
          {b.payMode === 'deposit' && b.status === 'confirmed' ? (
            <div className="kv">
              <span>Saldo en el club</span>
              <b>{formatMoney(b.price - b.chargeAmount)}</b>
            </div>
          ) : null}
          {b.status === 'held' && b.holdExpiresAt ? <p className="cx-muted">Retenido hasta las {hhmm.format(b.holdExpiresAt)}. Si no se acredita el pago, el turno se libera.</p> : null}
          {b.refundDue ? <p>El club te devuelve {formatMoney(b.refundDue)}.</p> : null}
          {b.status === 'confirmed' && !b.cancellable && b.startsAt > now ? <p className="cx-muted">Para cancelar con menos de {b.cancelHours} h, comunicate con el club.</p> : null}
          <GuestBookingActions token={token} payable={b.status === 'held' && b.pending > 0} cancellable={b.cancellable} title={b.title} />
        </Card>
        {b.status === 'confirmed' && b.endsAt > now ? (
          <Card title="QR para entrar">
            {qr ? (
              <>
                <CardQr src={`/api/m/bookings/public/${token}/qr`} label="Código QR de la reserva" initial={{ token: qr.token, expiresAt: qr.expiresAt.toISOString() }} />
                <p className="cx-muted">
                  Mostralo en la entrada. Vale desde el {day.format(qr.validFrom)} a las {hhmm.format(qr.validFrom)} hasta que termina el turno.
                </p>
              </>
            ) : (
              <p className="cx-muted">Estamos generando el QR para entrar: recargá en unos segundos.</p>
            )}
          </Card>
        ) : null}
        <Card title="¿Querés otro turno?">
          <p className="cx-muted">Guardá este enlace: con él ves, pagás o cancelás esta reserva.</p>
          <Link className="cx-btn cx-btn--secondary" href="/reservar">
            Reservar otro turno
          </Link>
        </Card>
      </div>
    </PublicShell>
  );
}
