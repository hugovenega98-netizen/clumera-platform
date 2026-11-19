import { createMatch } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { teamAccess } from '@/lib/sports-access';

const schema = z.object({ teamId: z.string().min(1), opponent: z.string().trim().min(1).max(100), startsAt: z.iso.datetime({ offset: true }), home: z.boolean(), venue: z.string().trim().max(100).optional() });

/** Programa un partido y convoca al plantel. Requiere sports:lineup.edit en el equipo. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const team = await getPrisma().team.findUnique({ where: { id: body.data.teamId }, include: { sport: true } });
  if (!team) return errorResponse('not_found', 'Equipo inexistente', 404);
  if (!(await teamAccess(session.personId, team)).coach) return errorResponse('forbidden', 'No dirigís este equipo', 403);
  const r = await createMatch(getPrisma(), session.personId, { ...body.data, startsAt: new Date(body.data.startsAt) });
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
