import { removeFamilyMember } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse } from '@/lib/http';
import { guard } from '@/lib/people-api';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; personId: string }> }) {
  const g = await guard('identity:person.manage', 'No tenés permiso para armar familias');
  if (!g.ok) return g.response;
  const { id, personId } = await params;
  const r = await removeFamilyMember(getPrisma(), g.session.personId, id, personId);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
