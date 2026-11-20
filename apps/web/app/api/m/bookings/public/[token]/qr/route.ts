import { RATE_RULES } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { clientIp, errorResponse, rateLimited } from '@/lib/http';
import { bookingFromToken } from '@/lib/public-booking';
import { requireModule } from '@/lib/require-module';
import { getCredentials } from '@/lib/services';

/** QR vigente de una reserva pública (se renueva cada 30 s). Solo con el enlace firmado. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  const limited = await rateLimited(RATE_RULES.publicBookingQrByIp, clientIp(request));
  if (limited) return limited;
  const id = bookingFromToken((await params).token);
  const b = id ? await getPrisma().booking.findUnique({ where: { id }, select: { public: true, status: true } }) : null;
  if (!b?.public) return errorResponse('not_found', 'Enlace inválido', 404);
  const qr = b.status === 'confirmed' ? await getCredentials().bookingQr(id!) : null;
  return NextResponse.json({ qr: qr ? { token: qr.token, expiresAt: qr.expiresAt } : null }, { headers: { 'cache-control': 'no-store' } });
}
