import { closeMatch } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coach');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ status: z.enum(['played', 'cancelled']), scoreFor: z.number().int().min(0).max(999).optional(), scoreAgainst: z.number().int().min(0).max(999).optional() }));
  if (!body.ok) return body.response;
  const r = await closeMatch(getPrisma(), g.match.id, body.data);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
