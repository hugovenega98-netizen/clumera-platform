import { registerTeam } from '@clumera/module-tournaments';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardTournaments } from '@/lib/tournaments-access';

/** Inscribir un equipo: quien lo inscribe queda como capitán y recibe el cargo de la inscripción. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardTournaments('tournaments:register', 'tournaments:manage');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ name: z.string().trim().min(3).max(40) }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const r = await registerTeam(db, g.session.personId, { tournamentId: (await params).id, name: body.data.name });
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value, { status: 201 });
}
