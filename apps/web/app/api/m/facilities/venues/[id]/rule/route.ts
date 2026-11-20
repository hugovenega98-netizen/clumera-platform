import { setBookingRule } from "@clumera/module-facilities";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardModule } from "@/lib/bookings-access";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, errorResponse, parseJson } from "@/lib/http";
import { requireModule } from "@/lib/require-module";

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** Reglas de reserva del espacio: turnos, horario, anticipación, retención, cancelación y seña. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Licencia primero: un módulo apagado responde 403 sin tocar la base.
  const denied = await requireModule("facilities");
  if (denied) return denied;
  const v = await getPrisma().venue.findUnique({
    where: { id: (await params).id },
    select: { id: true, slug: true },
  });
  const g = await guardModule(
    "facilities",
    "facilities:venue.manage",
    v ?? undefined,
  );
  if (!g.ok) return g.response;
  if (!v) return errorResponse("not_found", "Espacio inexistente", 404);
  const body = await parseJson(
    request,
    z.object({
      slotMinutes: int(15, 480),
      openFrom: int(0, 1439),
      openTo: int(1, 1440),
      maxAdvanceDays: int(0, 365),
      holdMinutes: int(2, 60),
      cancelHours: int(0, 720),
      depositPercent: int(0, 100),
      payAtClub: z.boolean(),
      publicBooking: z.boolean().default(false),
    }),
  );
  if (!body.ok) return body.response;
  const r = await setBookingRule(
    getPrisma(),
    g.session.personId,
    v.id,
    body.data,
  );
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
