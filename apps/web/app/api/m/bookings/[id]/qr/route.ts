import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { requireModule } from '@/lib/require-module';
import { getCredentials } from '@/lib/services';
import { getCurrentSession } from '@/lib/session';

/** QR vigente de una reserva propia (quien no es socio no tiene carnet: entra con este QR). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const { id } = await params;
  const b = await getPrisma().booking.findUnique({ where: { id }, select: { personId: true, status: true } });
  // Ajena o inexistente: la misma respuesta, para no revelar reservas de otros.
  if (!b || b.personId !== session.personId) return errorResponse('not_found', 'Reserva inexistente', 404);
  const qr = b.status === 'confirmed' ? await getCredentials().bookingQr(id) : null;
  return NextResponse.json({ qr: qr ? { token: qr.token, expiresAt: qr.expiresAt } : null }, { headers: { 'cache-control': 'no-store' } });
}
