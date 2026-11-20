import { recordResult } from '@clumera/module-tournaments';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardTournaments } from '@/lib/tournaments-access';

const Body = z.object({
  homeScore: z.number().int().min(0).max(999),
  awayScore: z.number().int().min(0).max(999),
  winnerTeamId: z.string().max(64).nullish(),
  reason: z.string().max(200).optional(),
});

/** Cargar o corregir el resultado de un partido (una corrección pide motivo y se audita). */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardTournaments('tournaments:result.record');
  if (!g.ok) return g.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const r = await recordResult(getPrisma(), g.session.personId, (await params).id, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  return NextResponse.json(r.value);
}
