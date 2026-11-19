import { recordEvent } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'desk');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ type: z.string().min(1).max(40), side: z.enum(['own', 'opponent']), personId: z.string().min(1).nullable().optional(), opponentPlayer: z.string().max(100).nullable().optional() }));
  if (!body.ok) return body.response;
  const r = await recordEvent(getPrisma(), g.match.id, g.session.personId, body.data);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
