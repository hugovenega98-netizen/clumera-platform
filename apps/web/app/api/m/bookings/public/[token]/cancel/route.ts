import { RATE_RULES } from '@clumera/identity';
import { cancelBooking } from '@clumera/module-bookings';
import { after, NextResponse } from 'next/server';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { clientIp, domainErrorResponse, errorResponse, rateLimited } from '@/lib/http';
import { bookingFromToken, mailGuestBooking } from '@/lib/public-booking';
import { requireModule } from '@/lib/require-module';

/** Cancelar una reserva pública con el enlace firmado (mismas reglas que un socio: hasta X h antes). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  const limited = await rateLimited(RATE_RULES.publicBookingLinkByIp, clientIp(request));
  if (limited) return limited;
  const id = bookingFromToken((await params).token);
  if (!id) return errorResponse('not_found', 'Enlace inválido', 404);
  const db = getPrisma();
  const b = await db.booking.findUnique({ where: { id }, select: { personId: true, public: true } });
  if (!b?.public) return errorResponse('not_found', 'Enlace inválido', 404);
  const r = await cancelBooking(db, b.personId, id, { byManager: false });
  if (!r.ok) return domainErrorResponse(r.error);
  after(async () => {
    await mailGuestBooking(db, id, 'booking.cancelled').catch(() => null);
    await deliverNow(db);
  });
  return NextResponse.json(r.value);
}
