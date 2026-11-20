import { createBooking } from "@clumera/module-bookings";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { guardModule, sweepHolds } from "@/lib/bookings-access";
import { deliverNow } from "@/lib/consumers";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, parseJson } from "@/lib/http";

/**
 * Reservar un turno para uno mismo. Online: devuelve el cargo a pagar (el checkout es el de Finanzas)
 * y el turno queda retenido unos minutos. En el club: queda confirmada con el cargo pendiente.
 */
export async function POST(request: Request) {
  const g = await guardModule("bookings", "bookings:book");
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({
      venueId: z.string().min(1).max(64),
      startsAt: z.iso.datetime(),
      payMode: z.enum(["full", "deposit", "club"]),
    }),
  );
  if (!body.ok) return body.response;
  await sweepHolds();
  const db = getPrisma();
  const r = await createBooking(db, g.session.personId, {
    personId: g.session.personId,
    venueId: body.data.venueId,
    startsAt: new Date(body.data.startsAt),
    payMode: body.data.payMode,
  });
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value, { status: 201 });
}
