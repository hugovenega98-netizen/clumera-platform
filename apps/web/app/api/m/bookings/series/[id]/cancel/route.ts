import { cancelBookingSeries, WEEKDAY_LABEL } from '@clumera/module-bookings';
import { notify } from '@clumera/notifications';
import { after, NextResponse } from 'next/server';
import { guardModule } from '@/lib/bookings-access';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { requireModule } from '@/lib/require-module';

/** Cancelar una reserva fija entera (las semanas que todavía no empezaron). Avisa a la persona. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  const db = getPrisma();
  const s = await db.bookingSeries.findUnique({ where: { id: (await params).id }, select: { id: true, weekday: true, startMinute: true, venue: { select: { slug: true, name: true } } } });
  const g = await guardModule('bookings', 'bookings:manage', s?.venue ?? { slug: '' });
  if (!g.ok) return g.response;
  if (!s) return errorResponse('not_found', 'Reserva fija inexistente', 404);
  const r = await cancelBookingSeries(db, g.session.personId, s.id);
  if (!r.ok) return domainErrorResponse(r.error);
  if (r.value.cancelled)
    await notify(db, {
      personIds: [r.value.personId],
      eventKey: `booking.series_cancelled:${s.id}`,
      source: 'bookings',
      title: 'El club canceló tu reserva fija',
      body: `${s.venue.name} · ${WEEKDAY_LABEL[s.weekday]} ${String(Math.floor(s.startMinute / 60)).padStart(2, '0')}:${String(s.startMinute % 60).padStart(2, '0')}: se cancelaron ${r.value.cancelled} ${r.value.cancelled === 1 ? 'semana' : 'semanas'}.`,
      url: '/reservas?vista=mias',
    });
  after(() => deliverNow(db));
  return NextResponse.json({ cancelled: r.value.cancelled });
}
