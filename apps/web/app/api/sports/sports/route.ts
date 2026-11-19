import { createSport } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Alta de un deporte del catálogo. Requiere sports:manage. */
export async function POST(request: Request) {
  const g = await guard('sports:manage', 'No tenés permiso para administrar deportes');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ code: z.string().min(2).max(40), slug: z.string().min(2).max(41), name: z.string().trim().min(2).max(60) }));
  if (!body.ok) return body.response;
  const r = await createSport(getPrisma(), body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
