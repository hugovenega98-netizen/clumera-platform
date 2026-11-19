import { recordEvent } from '@clumera/sports';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'desk');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ type: z.string().min(1).max(40), side: z.enum(['own', 'opponent']), personId: z.string().min(1).nullable().optional(), temporaryPlayerId: z.string().min(1).nullable().optional(), opponentPlayer: z.string().max(100).nullable().optional() }));
  if (!body.ok) return body.response;
  const r = await recordEvent(getPrisma(), g.match.id, g.session.personId, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  // Aviso push por la incidencia a convocados, familias y seguidores (después de responder).
  after(() => deliverNow(getPrisma()));
  return NextResponse.json(r.value);
}
