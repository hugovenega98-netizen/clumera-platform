import 'server-only';
import { familyView, type SessionInfo } from '@clumera/identity';
import type { NextResponse } from 'next/server';
import { permissionChecker } from './authz';
import { getPrisma } from './db';
import { errorResponse } from './http';
import { requireModule } from './require-module';
import { getCurrentSession } from './session';

/** Ámbito de una actividad para roles acotados (profesor de natación). */
export const activityScopes = (activity: string) => [{ type: 'activity' as const, id: activity }];

/** Personas por las que alguien inscribe: ella misma y sus representados (sin repetir). */
export async function manageablePeople(personId: string) {
  const db = getPrisma();
  const groups = await familyView(db, personId);
  const seen = new Map<string, { id: string; firstName: string; lastName: string; isSelf: boolean }>();
  const me = await db.person.findUniqueOrThrow({ where: { id: personId }, select: { id: true, firstName: true, lastName: true } });
  seen.set(me.id, { ...me, isSelf: true });
  for (const g of groups) for (const m of g.members) if (m.manageable && !seen.has(m.personId)) seen.set(m.personId, { id: m.personId, firstName: m.firstName, lastName: m.lastName, isSelf: false });
  return [...seen.values()];
}

/** Licencia de Escuelas + sesión + permiso (con el ámbito de la actividad, si se da). */
export async function guardSchools(
  permission: 'schools:enroll' | 'schools:manage' | 'schools:attendance.mark',
  activity?: string,
): Promise<{ ok: true; session: SessionInfo; can: Awaited<ReturnType<typeof permissionChecker>> } | { ok: false; response: NextResponse }> {
  const denied = await requireModule('schools');
  if (denied) return { ok: false, response: denied };
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  const can = await permissionChecker(session.personId);
  if (!can(permission, activity ? { scopes: activityScopes(activity) } : undefined)) return { ok: false, response: errorResponse('forbidden', 'No tenés permiso para esta acción', 403) };
  return { ok: true, session, can };
}
