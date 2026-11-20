import 'server-only';
import type { SessionInfo } from '@clumera/identity';
import type { NextResponse } from 'next/server';
import { permissionChecker } from './authz';
import { getPrisma } from './db';
import { errorResponse } from './http';
import { requireModule } from './require-module';
import { getCurrentSession } from './session';
import { actsFor } from './sports-access';

type Can = Awaited<ReturnType<typeof permissionChecker>>;

/** Licencia de Verano + sesión (+ permiso, si se da). */
export async function guardSummer(permission?: 'summer:camp.enroll' | 'summer:manage'): Promise<{ ok: true; session: SessionInfo; can: Can } | { ok: false; response: NextResponse }> {
  const denied = await requireModule('summer');
  if (denied) return { ok: false, response: denied };
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  const can = await permissionChecker(session.personId);
  if (permission && !can(permission)) return { ok: false, response: errorResponse('forbidden', 'No tenés permiso para esta acción', 403) };
  return { ok: true, session, can };
}

/** Inscripción de colonia que la persona puede gestionar (la suya o de su familia a cargo; o coordinación). */
export async function campEnrollmentFor(session: SessionInfo, can: Can, enrollmentId: string) {
  const e = await getPrisma().enrollment.findUnique({ where: { id: enrollmentId }, select: { id: true, personId: true, status: true, group: { select: { program: { select: { module: true } } } } } });
  if (!e || e.group.program.module !== 'summer') return { ok: false as const, response: errorResponse('not_found', 'Inscripción inexistente', 404) };
  if (!can('summer:manage') && !(await actsFor(session.personId, e.personId))) return { ok: false as const, response: errorResponse('forbidden', 'Solo podés gestionar las inscripciones de tu familia a cargo', 403) };
  return { ok: true as const, enrollment: e };
}
