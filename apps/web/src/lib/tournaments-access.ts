import 'server-only';
import type { SessionInfo } from '@clumera/identity';
import type { NextResponse } from 'next/server';
import { permissionChecker } from './authz';
import { errorResponse } from './http';
import { requireModule } from './require-module';
import { getCurrentSession } from './session';

type Can = Awaited<ReturnType<typeof permissionChecker>>;
export type TournamentPermission = 'tournaments:register' | 'tournaments:manage' | 'tournaments:result.record';

/** Licencia de Torneos + sesión (+ alguno de los permisos, si se dan). */
export async function guardTournaments(...permissions: TournamentPermission[]): Promise<{ ok: true; session: SessionInfo; can: Can } | { ok: false; response: NextResponse }> {
  const denied = await requireModule('tournaments');
  if (denied) return { ok: false, response: denied };
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  const can = await permissionChecker(session.personId);
  if (permissions.length && !permissions.some((p) => can(p))) return { ok: false, response: errorResponse('forbidden', 'No tenés permiso para esta acción', 403) };
  return { ok: true, session, can };
}
