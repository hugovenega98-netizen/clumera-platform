import { cancelAbsence } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const a = await getPrisma().absence.findUnique({ where: { id: (await params).id } });
  if (!a) return errorResponse('not_found', 'Ausencia inexistente', 404);
  if (!(await actsFor(session.personId, a.personId))) return errorResponse('forbidden', 'No podés anular esta ausencia', 403);
  const r = await cancelAbsence(getPrisma(), a.id);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
