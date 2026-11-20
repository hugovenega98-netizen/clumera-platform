import { removeBlock } from "@clumera/module-facilities";
import { NextResponse } from "next/server";
import { guardModule } from "@/lib/bookings-access";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, errorResponse } from "@/lib/http";
import { requireModule } from "@/lib/require-module";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Licencia primero: un módulo apagado responde 403 sin tocar la base.
  const denied = await requireModule("facilities");
  if (denied) return denied;
  const s = await getPrisma().agendaSlot.findUnique({
    where: { id: (await params).id },
    select: { id: true, venue: { select: { slug: true } } },
  });
  const g = await guardModule(
    "facilities",
    "facilities:block.manage",
    s?.venue,
  );
  if (!g.ok) return g.response;
  if (!s) return errorResponse("not_found", "Bloqueo inexistente", 404);
  const r = await removeBlock(getPrisma(), g.session.personId, s.id);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
