import { createTeam } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Alta de un equipo o categoría. Requiere sports:manage. */
export async function POST(request: Request) {
  const g = await guard('sports:manage', 'No tenés permiso para administrar deportes');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ sportId: z.string().min(1), name: z.string().trim().min(1).max(60), slug: z.string().min(2).max(41), monthlyFee: z.number().int().positive().nullable().optional() }));
  if (!body.ok) return body.response;
  const r = await createTeam(getPrisma(), body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
