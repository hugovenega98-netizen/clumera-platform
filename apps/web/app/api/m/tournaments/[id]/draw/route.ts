import { drawAndSchedule } from '@clumera/module-tournaments';
import { after, NextResponse } from 'next/server';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse } from '@/lib/http';
import { guardTournaments } from '@/lib/tournaments-access';

/** Cerrar la inscripción: sorteo de zonas y fixture con canchas y horarios. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardTournaments('tournaments:manage');
  if (!g.ok) return g.response;
  const db = getPrisma();
  const r = await drawAndSchedule(db, g.session.personId, (await params).id);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value);
}
