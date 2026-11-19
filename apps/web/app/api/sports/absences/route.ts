import { reportAbsence } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/** Avisar una ausencia: la persona o su responsable. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(request, z.object({ personId: z.string().min(1), teamId: z.string().min(1), date: z.iso.date(), reason: z.string().trim().min(3).max(200) }));
  if (!body.ok) return body.response;
  if (!(await actsFor(session.personId, body.data.personId))) return errorResponse('forbidden', 'Solo podés avisar por vos o por tu familia a cargo', 403);
  const r = await reportAbsence(getPrisma(), session.personId, { ...body.data, date: new Date(`${body.data.date}T00:00:00Z`) });
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
