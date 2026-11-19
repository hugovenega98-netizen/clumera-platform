import { createFamilyGroup } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { familyMember } from '@/lib/family-schema';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Grupo familiar nuevo. */
export async function POST(request: Request) {
  const g = await guard('identity:person.manage', 'No tenés permiso para armar familias');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ name: z.string().trim().min(2).max(80), members: z.array(familyMember).min(1).max(20) }));
  if (!body.ok) return body.response;
  const r = await createFamilyGroup(getPrisma(), g.session.personId, body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
