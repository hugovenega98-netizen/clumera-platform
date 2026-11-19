import 'server-only';
import type { SessionInfo } from '@clumera/identity';
import { forbidden } from 'next/navigation';
import { permissionChecker } from './authz';
import { requireSession } from './session';

/** Permisos que abren el espacio de administración (cada área pide además el suyo). */
export const ADMIN_ENTRY = ['identity:person.view', 'finance:report.view'] as const;

/**
 * Sesión + permiso para una pantalla de administración. Sin permiso responde 403 (forbidden.tsx):
 * esconder el menú no alcanza, la decisión es del servidor.
 */
export async function requireAdmin(next: string, permission?: string): Promise<{ session: SessionInfo; can: (action: string) => boolean }> {
  const session = await requireSession(next);
  const can = await permissionChecker(session.personId);
  const allowed = permission ? can(permission) : ADMIN_ENTRY.some((p) => can(p));
  if (!allowed) forbidden();
  return { session, can };
}
