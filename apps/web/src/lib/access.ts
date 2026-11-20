import 'server-only';
import { authorize } from './authz';
import { errorResponse } from './http';
import { requireModule } from './require-module';
import { getCurrentSession } from './session';

/** Licencia de Accesos + sesión + permiso. Devuelve la sesión o la respuesta de error. */
export async function guardAccess(permission: 'access:validate' | 'access:override' | 'access:log.view') {
  const denied = await requireModule('access');
  if (denied) return { ok: false as const, response: denied };
  const session = await getCurrentSession();
  if (!session) return { ok: false as const, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  if (!(await authorize(session.personId, permission)).allowed) return { ok: false as const, response: errorResponse('forbidden', 'No tenés permiso para esta acción de Recepción', 403) };
  return { ok: true as const, session };
}

