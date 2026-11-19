import { voidEvent } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

/** Deshacer una incidencia de la mesa (queda anulada). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = await getPrisma().matchEvent.findUnique({ where: { id: (await params).id }, select: { id: true, matchId: true } });
  if (!e) return errorResponse('not_found', 'Incidencia inexistente', 404);
  const g = await guardMatch(e.matchId, 'desk');
  if (!g.ok) return g.response;
  const r = await voidEvent(getPrisma(), e.id);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
