import { availability, isMember } from "@clumera/module-bookings";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { guardModule, sweepHolds } from "@/lib/bookings-access";
import { errorResponse } from "@/lib/http";

/** Turnos de un día para un espacio (libre / ocupado con motivo, nunca quién reservó). */
export async function GET(request: Request) {
  const g = await guardModule("bookings", "bookings:book");
  if (!g.ok) return g.response;
  const url = new URL(request.url);
  const venueId = url.searchParams.get("espacio") ?? "";
  const day = url.searchParams.get("dia") ?? "";
  if (!venueId || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    return errorResponse("invalid_input", "Indicá espacio y día", 400);
  await sweepHolds();
  const db = getPrisma();
  const slots = await availability(
    db,
    venueId,
    day,
    await isMember(db, g.session.personId),
  );
  if (!slots)
    return errorResponse("not_found", "Ese espacio no se reserva online", 404);
  return NextResponse.json(
    { slots },
    { headers: { "cache-control": "no-store" } },
  );
}
