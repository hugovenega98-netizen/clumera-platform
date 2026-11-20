import { addTariff } from "@clumera/module-facilities";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardModule } from "@/lib/bookings-access";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, errorResponse, parseJson } from "@/lib/http";
import { requireModule } from "@/lib/require-module";

/** Tarifa por franja (precio de socio y de no socio, en centavos). */
export async function POST(
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
  const money = z.number().int().min(0).max(100_000_000);
  const body = await parseJson(
    request,
    z.object({
      label: z.string().trim().min(2).max(40),
      days: z.number().int().min(1).max(127),
      fromMinute: z.number().int().min(0).max(1439),
      toMinute: z.number().int().min(1).max(1440),
      memberPrice: money,
      guestPrice: money,
    }),
  );
  if (!body.ok) return body.response;
  const r = await addTariff(getPrisma(), g.session.personId, v.id, body.data);
  return r.ok
    ? NextResponse.json(r.value, { status: 201 })
    : domainErrorResponse(r.error);
}
