import { setLineup } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coach');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ personIds: z.array(z.string().min(1)).max(60) }));
  if (!body.ok) return body.response;
  const r = await setLineup(getPrisma(), g.match.id, body.data.personIds);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
