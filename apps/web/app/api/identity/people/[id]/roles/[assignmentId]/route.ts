import { revokeRole } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { guard, isSuperadmin } from '@/lib/people-api';

/** Quita un rol. Requiere identity:role.assign. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const g = await guard('identity:role.assign', 'No tenés permiso para quitar roles');
  if (!g.ok) return g.response;
  const { id, assignmentId } = await params;
  const db = getPrisma();
  if (!(await db.roleAssignment.findFirst({ where: { id: assignmentId, personId: id } }))) return errorResponse('not_found', 'Ese rol no es de esta persona', 404);
  const r = await revokeRole(db, { personId: g.session.personId, isSuperadmin: await isSuperadmin(g.session.personId) }, assignmentId);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
