import { clockAction } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'desk');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ action: z.enum(['start_first_half', 'pause', 'resume', 'half_time', 'start_second_half', 'add_time', 'finish_clock']) }));
  if (!body.ok) return body.response;
  const r = await clockAction(getPrisma(), g.match.id, body.data.action);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
