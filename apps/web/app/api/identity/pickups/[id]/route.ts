import { revokePickup } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { permissionChecker } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/** Revocar una autorización de retiro (la familia o la coordinación). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const db = getPrisma();
  const a = await db.pickupAuthorization.findUnique({ where: { id: (await params).id }, select: { id: true, minorId: true } });
  if (!a) return errorResponse('not_found', 'Autorización inexistente', 404);
  const can = await permissionChecker(session.personId);
  if (!can('summer:manage') && !(await actsFor(session.personId, a.minorId))) return errorResponse('forbidden', 'No podés revocar esta autorización', 403);
  const r = await revokePickup(db, session.personId, a.id);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
