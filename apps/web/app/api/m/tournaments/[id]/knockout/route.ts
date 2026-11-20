import { generateKnockout } from '@clumera/module-tournaments';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse } from '@/lib/http';
import { guardTournaments } from '@/lib/tournaments-access';

/** Armar la eliminación con los clasificados de la tabla. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardTournaments('tournaments:manage');
  if (!g.ok) return g.response;
  const r = await generateKnockout(getPrisma(), g.session.personId, (await params).id);
  if (!r.ok) return domainErrorResponse(r.error);
  return NextResponse.json(r.value);
}
