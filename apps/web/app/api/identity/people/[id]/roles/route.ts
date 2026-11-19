import { assignRole, SCOPE_TYPES } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard, isSuperadmin } from '@/lib/people-api';

const schema = z.object({ roleCode: z.string().min(1).max(60), scopeType: z.enum(SCOPE_TYPES), scopeId: z.string().max(63).optional() });

/** Asigna un rol con su ámbito. Requiere identity:role.assign (superadmin, solo otro superadmin). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('identity:role.assign', 'No tenés permiso para asignar roles');
  if (!g.ok) return g.response;
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const { id } = await params;
  const r = await assignRole(getPrisma(), { personId: g.session.personId, isSuperadmin: await isSuperadmin(g.session.personId) }, { personId: id, ...body.data });
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
