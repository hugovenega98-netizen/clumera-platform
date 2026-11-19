import 'server-only';
import type { SessionInfo } from '@clumera/identity';
import type { NextResponse } from 'next/server';
import { permissionChecker } from './authz';
import { getPrisma } from './db';
import { errorResponse } from './http';
import { getCurrentSession } from './session';

/** Sesión + permiso para la API del padrón: 401 sin sesión, 403 sin permiso. */
export async function guard(permission: string, message: string): Promise<{ ok: true; session: SessionInfo } | { ok: false; response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  if (!(await permissionChecker(session.personId))(permission)) return { ok: false, response: errorResponse('forbidden', message, 403) };
  return { ok: true, session };
}

export async function isSuperadmin(personId: string): Promise<boolean> {
  return (await getPrisma().roleAssignment.count({ where: { personId, roleCode: 'superadmin', active: true } })) > 0;
}

export const docPepper = () => process.env.CLUMERA_DOC_PEPPER || undefined;
