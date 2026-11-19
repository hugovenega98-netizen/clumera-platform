import { removeTemporaryPlayer } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await getPrisma().matchTemporaryPlayer.findUnique({ where: { id: (await params).id }, select: { id: true, matchId: true } });
  if (!p) return errorResponse('not_found', 'Jugador inexistente', 404);
  const g = await guardMatch(p.matchId, 'coachOrDesk');
  if (!g.ok) return g.response;
  const r = await removeTemporaryPlayer(getPrisma(), p.id);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
