import { cancelBooking } from "@clumera/module-bookings";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { permissionChecker } from "@/lib/authz";
import { guardModule, venueScopes } from "@/lib/bookings-access";
import { deliverNow } from "@/lib/consumers";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, errorResponse, parseJson } from "@/lib/http";

/** Cancelar: la persona, la propia (con plazo); el encargado del espacio, cualquiera. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardModule("bookings");
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({ reason: z.string().max(200).optional() }),
  );
  if (!body.ok) return body.response;
  const db = getPrisma();
  const b = await db.booking.findUnique({
    where: { id: (await params).id },
    select: { id: true, personId: true, venue: { select: { slug: true } } },
  });
  if (!b) return errorResponse("not_found", "Reserva inexistente", 404);
  const can = await permissionChecker(g.session.personId);
  const manager = can("bookings:manage", { scopes: venueScopes(b.venue) });
  if (!manager && b.personId !== g.session.personId)
    return errorResponse("forbidden", "Solo podés cancelar tus reservas", 403);
  const r = await cancelBooking(db, g.session.personId, b.id, {
    byManager: manager && b.personId !== g.session.personId,
    reason: body.data.reason,
  });
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value);
}
