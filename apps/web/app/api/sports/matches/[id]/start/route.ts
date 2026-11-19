import { startMatch } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coachOrDesk');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({}).passthrough());
  if (!body.ok) return body.response;
  const r = await startMatch(getPrisma(), g.match.id);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
