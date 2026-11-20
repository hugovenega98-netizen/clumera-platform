import 'server-only';
import { sweepExpiredBookings } from '@clumera/module-bookings';
import type { NextResponse } from 'next/server';
import { permissionChecker } from './authz';
import { getPrisma } from './db';
import { errorResponse } from './http';
import { requireModule } from './require-module';
import { getCurrentSession } from './session';
import type { SessionInfo } from '@clumera/identity';

/** Ámbito de un espacio para roles acotados (encargado de un espacio puntual). */
export const venueScopes = (v: { slug: string }) => [{ type: 'venue' as const, id: v.slug }];

/** Espacios que la persona administra (todos si su rol es de club). */
export async function managedVenues(personId: string, permission: 'facilities:venue.view' | 'facilities:venue.manage' | 'facilities:block.manage' | 'bookings:manage') {
  const can = await permissionChecker(personId);
  const venues = await getPrisma().venue.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return venues.filter((v) => can(permission, { scopes: venueScopes(v) }));
}

/**
 * Barreras de una ruta de Reservas o Instalaciones: módulo licenciado (403), sesión (401) y,
 * si se pide, permiso sobre un espacio (403).
 */
export async function guardModule(
  moduleId: 'bookings' | 'facilities',
  permission?: string,
  venue?: { slug: string },
): Promise<{ ok: true; session: SessionInfo } | { ok: false; response: NextResponse }> {
  const denied = await requireModule(moduleId);
  if (denied) return { ok: false, response: denied };
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  if (permission) {
    const can = await permissionChecker(session.personId);
    if (!can(permission, venue ? { scopes: venueScopes(venue) } : undefined)) return { ok: false, response: errorResponse('forbidden', 'No tenés permiso para esta acción', 403) };
  }
  return { ok: true, session };
}

/** Libera turnos retenidos vencidos antes de mostrar o tomar turnos (además del cron). */
export async function sweepHolds(): Promise<void> {
  await sweepExpiredBookings(getPrisma()).catch(() => null);
}
