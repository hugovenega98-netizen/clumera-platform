import { setVenueStatus, VENUE_STATUSES } from "@clumera/module-facilities";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardModule } from "@/lib/bookings-access";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, errorResponse, parseJson } from "@/lib/http";
import { requireModule } from "@/lib/require-module";

/** Estado físico del espacio (disponible, mantenimiento, fuera de servicio). */
export async function PATCH(
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
      status: z.enum(VENUE_STATUSES),
      note: z.string().max(120).optional(),
    }),
  );
  if (!body.ok) return body.response;
  const r = await setVenueStatus(
    getPrisma(),
    g.session.personId,
    v.id,
    body.data.status,
    body.data.note,
  );
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
