import { AVAILABILITIES, INJURY_STATUSES, recordEvaluation } from '@clumera/sports';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { healthAccessToReport } from '@/lib/sports-access';

/** Evaluación de Médico/Kine (sports:health.view en el deporte del equipo). Superadmin no entra. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await healthAccessToReport((await params).id);
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ status: z.enum(INJURY_STATUSES), availability: z.enum(AVAILABILITIES), publicNote: z.string().max(2000).optional(), privateNote: z.string().max(2000).optional() }));
  if (!body.ok) return body.response;
  const author = await getPrisma().person.findUnique({ where: { id: g.session.personId }, select: { firstName: true, lastName: true } });
  if (!author) return errorResponse('forbidden', 'Sin perfil', 403);
  const r = await recordEvaluation(getPrisma(), { personId: g.session.personId, name: `${author.firstName} ${author.lastName}` }, g.reportId, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(getPrisma()));
  return NextResponse.json(r.value, { status: 201 });
}
