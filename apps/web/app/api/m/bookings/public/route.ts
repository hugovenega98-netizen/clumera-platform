import { RATE_RULES } from '@clumera/identity';
import { createPublicBooking } from '@clumera/module-bookings';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { sweepHolds } from '@/lib/bookings-access';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { guestKey } from '@/lib/guest';
import { clientIp, domainErrorResponse, errorResponse, parseJson, rateLimited } from '@/lib/http';
import { guestBookingLink, mailGuestBooking, startGuestCheckout } from '@/lib/public-booking';
import { requireModule } from '@/lib/require-module';
import { getGateway } from '@/lib/services';

const schema = z.object({
  venueId: z.string().min(1).max(64),
  startsAt: z.iso.datetime(),
  payMode: z.enum(['full', 'deposit']),
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().min(8).max(30),
  email: z.string().trim().min(5).max(200),
  terms: z.literal(true, { error: 'Aceptá las condiciones para reservar' }),
});

/**
 * Reserva pública sin cuenta (sin sesión): tarifa general y pago online. Devuelve el enlace de
 * Mercado Pago y el enlace firmado de la reserva, que también llega por correo.
 */
export async function POST(request: Request) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  if (!getGateway() || !guestKey()) return errorResponse('not_configured', 'Las reservas sin cuenta todavía no están habilitadas en el club', 503);
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const limited = (await rateLimited(RATE_RULES.publicBookingByIp, clientIp(request))) ?? (await rateLimited(RATE_RULES.publicBookingByEmail, body.data.email.toLowerCase()));
  if (limited) return limited;
  await sweepHolds();
  const db = getPrisma();
  const r = await createPublicBooking(db, {
    venueId: body.data.venueId,
    startsAt: new Date(body.data.startsAt),
    payMode: body.data.payMode,
    guest: { name: body.data.name, phone: body.data.phone, email: body.data.email },
  });
  if (!r.ok) return domainErrorResponse(r.error);
  const link = guestBookingLink(r.value.id)!;
  after(async () => {
    await mailGuestBooking(db, r.value.id, 'held').catch(() => null);
    await deliverNow(db);
  });
  const pay = await startGuestCheckout(db, { id: r.value.id, personId: r.value.personId, chargeId: r.value.chargeId });
  // Sin checkout el turno sigue retenido: se puede reintentar el pago desde el enlace.
  return NextResponse.json({ id: r.value.id, link, checkoutUrl: pay.ok ? pay.checkoutUrl : null, payError: pay.ok ? null : pay.message }, { status: 201 });
}
