import { addTemporaryPlayer } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

/** Planilla transitoria: alguien que juega este partido sin ser del plantel (coach o mesa). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coachOrDesk');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ name: z.string().trim().min(2).max(100), number: z.number().int().min(0).max(999).nullable().optional() }));
  if (!body.ok) return body.response;
  const r = await addTemporaryPlayer(getPrisma(), g.match.id, body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
