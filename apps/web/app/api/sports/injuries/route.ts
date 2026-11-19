import { reportInjury } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/** Informar una lesión o molestia: la persona o su responsable, en uno de sus equipos. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(
    request,
    z.object({
      personId: z.string().min(1),
      teamId: z.string().min(1),
      zone: z.string().trim().min(2).max(80),
      pain: z.coerce.number().int().min(0).max(10),
      context: z.string().trim().min(2).max(80),
      impact: z.string().trim().min(2).max(80),
      onsetDate: z.iso.date(),
      notes: z.string().max(2000).optional(),
    }),
  );
  if (!body.ok) return body.response;
  if (!(await actsFor(session.personId, body.data.personId))) return errorResponse('forbidden', 'Solo podés informar por vos o por tu familia a cargo', 403);
  const r = await reportInjury(getPrisma(), session.personId, { ...body.data, onsetDate: new Date(`${body.data.onsetDate}T00:00:00Z`) });
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
