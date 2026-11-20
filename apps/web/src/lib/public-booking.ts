import 'server-only';
import type { PrismaClient } from '@clumera/db';
import { formatMoney, startOnlinePayment } from '@clumera/finance';
import { bookingTitle, guestBookingToken, readGuestBookingToken } from '@clumera/module-bookings';
import { clientConfig } from './client-config';
import { guestKey } from './guest';
import { appOrigin, getGateway, getMailer } from './services';

/** Enlace para ver, pagar o cancelar una reserva hecha sin cuenta. Null si la instalación no tiene clave. */
export function guestBookingLink(bookingId: string): string | null {
  const key = guestKey();
  return key ? `/reservar/r/${guestBookingToken(bookingId, key)}` : null;
}

export function bookingFromToken(token: string): string | null {
  const key = guestKey();
  return key ? readGuestBookingToken(decodeURIComponent(token), key) : null;
}

/**
 * Checkout de Mercado Pago para el cargo de una reserva pública. El pagador es la persona invitada;
 * el servicio se confirma recién con el webhook, nunca con el regreso.
 */
export async function startGuestCheckout(db: PrismaClient, booking: { id: string; personId: string; chargeId: string | null }): Promise<{ ok: true; checkoutUrl: string } | { ok: false; status: number; code: string; message: string }> {
  const gateway = getGateway();
  if (!gateway) return { ok: false, status: 503, code: 'not_configured', message: 'El pago online todavía no está habilitado en el club' };
  if (!booking.chargeId) return { ok: false, status: 409, code: 'conflict', message: 'Esta reserva no tiene nada para pagar' };
  const link = guestBookingLink(booking.id);
  if (!link) return { ok: false, status: 503, code: 'not_configured', message: 'Las reservas sin cuenta no están habilitadas en el club' };
  const started = await startOnlinePayment(db, { payerPersonId: booking.personId, chargeIds: [booking.chargeId], provider: gateway.name });
  if (!started.ok) return { ok: false, status: 409, code: started.error.code, message: started.error.message };
  const payer = await db.person.findUnique({ where: { id: booking.personId }, select: { email: true } });
  try {
    const origin = appOrigin();
    const { checkoutUrl, preferenceId } = await gateway.createCheckout({
      paymentId: started.value.id,
      items: started.value.charges.map((c) => ({ id: c.id, title: c.description, amount: c.amount })),
      payerEmail: process.env.MP_TEST_PAYER_EMAIL?.trim() || payer?.email || undefined,
      backUrl: `${origin}${link}?pago=1`,
      notificationUrl: `${origin}/api/webhooks/mercadopago`,
    });
    await db.paymentEvent.create({ data: { paymentId: started.value.id, kind: 'preference_created', detail: { preferenceId } } });
    return { ok: true, checkoutUrl };
  } catch {
    await db.payment.update({ where: { id: started.value.id }, data: { status: 'rejected' } });
    await db.paymentEvent.create({ data: { paymentId: started.value.id, kind: 'preference_failed' } });
    return { ok: false, status: 502, code: 'gateway_error', message: 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.' };
  }
}

const MAIL: Record<string, (title: string) => [string, string]> = {
  held: (t) => [`Tu reserva: ${t}`, `Reservaste ${t}. El turno queda retenido unos minutos hasta que se acredite el pago.`],
  'booking.confirmed': (t) => [`Reserva confirmada: ${t}`, `Se acreditó el pago: ${t} está confirmada.`],
  'booking.released': (t) => [`Se liberó tu turno: ${t}`, `Venció el tiempo para pagar ${t} y el turno se liberó.`],
  'booking.conflict': (t) => [`Tu pago llegó tarde: ${t}`, `El turno ${t} ya estaba tomado cuando se acreditó el pago. El club te devuelve lo pagado.`],
  'booking.cancelled': (t) => [`Reserva cancelada: ${t}`, `La reserva ${t} quedó cancelada.`],
};

/** Correo a la persona invitada con el enlace de su reserva. No hace nada si no es pública o no tiene email. */
export async function mailGuestBooking(db: Pick<PrismaClient, 'booking'>, bookingId: string, kind: keyof typeof MAIL): Promise<void> {
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, public: true, startsAt: true, price: true, chargeAmount: true, payMode: true, venue: { select: { name: true } }, person: { select: { email: true, firstName: true } } } });
  if (!b?.public || !b.person.email) return;
  const link = guestBookingLink(b.id);
  if (!link) return;
  const title = bookingTitle(b.venue.name, b.startsAt);
  const [subject, line] = MAIL[kind]!(title);
  const url = `${appOrigin()}${link}`;
  const club = clientConfig.identity.displayName;
  const balance = b.payMode === 'deposit' && kind === 'booking.confirmed' ? `\nSaldo a pagar en el club: ${formatMoney(b.price - b.chargeAmount)}.` : '';
  const text = `Hola ${b.person.firstName}:\n\n${line}${balance}\n\nVer, pagar o cancelar tu reserva: ${url}\n\n${club}`;
  await getMailer().send({ to: b.person.email, subject: `${club} · ${subject}`, text, tag: 'reserva-publica' });
}
