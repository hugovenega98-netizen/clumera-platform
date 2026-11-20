import { withdrawTeam } from '@clumera/module-tournaments';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { guardTournaments } from '@/lib/tournaments-access';

/** Baja de un equipo antes del sorteo (su capitán u Organización). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardTournaments('tournaments:register', 'tournaments:manage');
  if (!g.ok) return g.response;
  const db = getPrisma();
  const team = await db.tournamentTeam.findUnique({ where: { id: (await params).id }, select: { id: true, captainId: true } });
  if (!team) return errorResponse('not_found', 'Equipo inexistente', 404);
  if (team.captainId !== g.session.personId && !g.can('tournaments:manage')) return errorResponse('forbidden', 'Solo el capitán puede dar de baja su equipo', 403);
  const r = await withdrawTeam(db, g.session.personId, team.id);
  if (!r.ok) return domainErrorResponse(r.error);
  return NextResponse.json(r.value);
}
