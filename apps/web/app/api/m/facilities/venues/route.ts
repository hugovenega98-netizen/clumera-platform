import { createVenue } from "@clumera/module-facilities";
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardModule } from "@/lib/bookings-access";
import { getPrisma } from "@/lib/db";
import { domainErrorResponse, parseJson } from "@/lib/http";

/** Alta de un espacio (encargado de instalaciones de todo el club). */
export async function POST(request: Request) {
  const g = await guardModule("facilities", "facilities:venue.manage");
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({
      name: z.string().trim().min(2).max(60),
      slug: z.string().trim().min(2).max(40),
      group: z.string().trim().min(2).max(40),
      detail: z.string().max(60).optional(),
    }),
  );
  if (!body.ok) return body.response;
  const r = await createVenue(getPrisma(), g.session.personId, body.data);
  return r.ok
    ? NextResponse.json(r.value, { status: 201 })
    : domainErrorResponse(r.error);
}
