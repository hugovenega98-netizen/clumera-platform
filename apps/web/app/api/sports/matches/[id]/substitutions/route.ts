import { recordSubstitution } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

/** Cambio desde la mesa. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'desk');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ outPersonId: z.string().min(1), inPersonId: z.string().min(1) }));
  if (!body.ok) return body.response;
  const r = await recordSubstitution(getPrisma(), g.match.id, g.session.personId, body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
