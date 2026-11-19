import { setTeamMember } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Sumar o quitar a alguien del plantel. Requiere sports:manage. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('sports:manage', 'No tenés permiso para administrar planteles');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ personId: z.string().min(1), active: z.boolean(), number: z.number().int().min(0).max(999).nullable().optional() }));
  if (!body.ok) return body.response;
  const r = await setTeamMember(getPrisma(), (await params).id, body.data.personId, body.data.active, body.data.number);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
