import { respondCallup } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/** Responder la convocatoria: la persona o su responsable. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(request, z.object({ personId: z.string().min(1), response: z.enum(['going', 'not_going']), note: z.string().max(200).optional() }));
  if (!body.ok) return body.response;
  if (!(await actsFor(session.personId, body.data.personId))) return errorResponse('forbidden', 'Solo podés responder por vos o por tu familia a cargo', 403);
  const r = await respondCallup(getPrisma(), (await params).id, body.data.personId, body.data.response, body.data.note);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
