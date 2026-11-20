import { createBookingSeries } from '@clumera/module-bookings';
import { notify } from '@clumera/notifications';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardModule, sweepHolds } from '@/lib/bookings-access';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { requireModule } from '@/lib/require-module';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Reserva fija (encargado del espacio): el mismo turno cada semana entre dos fechas, a pagar en el club. */
export async function POST(request: Request) {
  const denied = await requireModule('bookings');
  if (denied) return denied;
  const body = await parseJson(
    request,
    z.object({
      venueId: z.string().min(1).max(64),
      personId: z.string().min(1).max(64),
      weekday: z.number().int().min(0).max(6),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      fromDay: day,
      untilDay: day,
      label: z.string().trim().max(80).optional(),
    }),
  );
  if (!body.ok) return body.response;
  const db = getPrisma();
  const venue = await db.venue.findUnique({ where: { id: body.data.venueId }, select: { id: true, slug: true, name: true } });
  const g = await guardModule('bookings', 'bookings:manage', venue ?? { slug: '' });
  if (!g.ok) return g.response;
  if (!venue) return errorResponse('not_found', 'Espacio inexistente', 404);
  await sweepHolds();
  const [h, m] = body.data.time.split(':').map(Number);
  const r = await createBookingSeries(db, g.session.personId, { ...body.data, startMinute: h! * 60 + m! });
  if (!r.ok) return domainErrorResponse(r.error);
  const { booked, skipped } = r.value;
  await notify(db, {
    personIds: [body.data.personId],
    eventKey: `booking.series:${r.value.id}`,
    source: 'bookings',
    title: 'Te cargaron una reserva fija',
    body: `${venue.name}: ${booked.length} ${booked.length === 1 ? 'semana' : 'semanas'} a las ${body.data.time}, a pagar en el club.`,
    url: '/reservas?vista=mias',
  });
  after(() => deliverNow(db));
  return NextResponse.json({ id: r.value.id, booked, skipped }, { status: 201 });
}
