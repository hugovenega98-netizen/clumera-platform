import { createTournament } from '@clumera/module-tournaments';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardTournaments } from '@/lib/tournaments-access';

const Body = z.object({
  slug: z.string().trim().min(3).max(48),
  name: z.string().trim().min(3).max(80),
  sportCode: z.string().min(1).max(40),
  description: z.string().max(300).optional(),
  maxTeams: z.number().int().min(2).max(64),
  zoneCount: z.number().int().min(1).max(2),
  qualifiersPerZone: z.number().int().min(1).max(4),
  entryFee: z.number().int().min(0).max(1_000_000_000),
  playDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  firstMatchMinute: z.number().int().min(0).max(23 * 60),
  matchMinutes: z.number().int().min(10).max(240),
  places: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
});

/** Crear un torneo (Organización). */
export async function POST(request: Request) {
  const g = await guardTournaments('tournaments:manage');
  if (!g.ok) return g.response;
  const body = await parseJson(request, Body);
  if (!body.ok) return body.response;
  const r = await createTournament(getPrisma(), g.session.personId, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  return NextResponse.json({ id: r.value.id, slug: body.data.slug }, { status: 201 });
}
