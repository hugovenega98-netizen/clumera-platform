import { addFamilyMember } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';
import { familyMember } from '@/lib/family-schema';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('identity:person.manage', 'No tenés permiso para armar familias');
  if (!g.ok) return g.response;
  const body = await parseJson(request, familyMember);
  if (!body.ok) return body.response;
  const r = await addFamilyMember(getPrisma(), g.session.personId, (await params).id, body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
