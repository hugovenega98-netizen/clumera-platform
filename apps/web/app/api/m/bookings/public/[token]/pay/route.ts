import { RATE_RULES } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { clientIp, errorResponse, rateLimited } from '@/lib/http';
import { bookingFromToken, startGuestCheckout } from '@/lib/public-booking';
import { requireModule } from '@/lib/require-module';

/** Reintentar el pago de una reserva pública retenida, con el enlace firmado. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  const limited = await rateLimited(RATE_RULES.publicBookingLinkByIp, clientIp(request));
  if (limited) return limited;
  const id = bookingFromToken((await params).token);
  if (!id) return errorResponse('not_found', 'Enlace inválido', 404);
  await sweepHolds();
  const db = getPrisma();
  const b = await db.booking.findUnique({ where: { id }, select: { id: true, personId: true, chargeId: true, status: true, public: true } });
  if (!b?.public) return errorResponse('not_found', 'Enlace inválido', 404);
  if (b.status !== 'held') return errorResponse('conflict', 'Esta reserva ya no espera un pago', 409);
  const pay = await startGuestCheckout(db, b);
  if (!pay.ok) return errorResponse(pay.code, pay.message, pay.status);
  return NextResponse.json({ checkoutUrl: pay.checkoutUrl }, { status: 201 });
}
