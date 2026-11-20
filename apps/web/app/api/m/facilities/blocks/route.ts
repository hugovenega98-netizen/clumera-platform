import { createBlock } from "@clumera/module-facilities";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { guardModule } from "@/lib/bookings-access";
import { deliverNow } from "@/lib/consumers";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, errorResponse, parseJson } from "@/lib/http";
import { requireModule } from "@/lib/require-module";

/** Bloqueo (mantenimiento, armado): ocupa la agenda con máxima prioridad. */
export async function POST(request: Request) {
  // Licencia primero: un módulo apagado responde 403 sin tocar la base.
  const denied = await requireModule("facilities");
  if (denied) return denied;
  const body = await parseJson(
    request,
    z.object({
      venueId: z.string().min(1).max(64),
      day: z.iso.date(),
      fromMinute: z.number().int().min(0).max(1439),
      toMinute: z.number().int().min(1).max(1440),
      reason: z.string().trim().min(3).max(80),
    }),
  );
  const v = body.ok
    ? await getPrisma().venue.findUnique({
        where: { id: body.data.venueId },
        select: { id: true, slug: true },
      })
    : null;
  const g = await guardModule(
    "facilities",
    "facilities:block.manage",
    v ?? undefined,
  );
  if (!g.ok) return g.response;
  if (!body.ok) return body.response;
  if (!v) return errorResponse("not_found", "Espacio inexistente", 404);
  const db = getPrisma();
  const r = await createBlock(db, g.session.personId, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value, { status: 201 });
}
