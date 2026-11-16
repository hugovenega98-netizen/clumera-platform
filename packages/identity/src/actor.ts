import type { PrismaClient } from '@clumera/db';
import type { Actor, RoleCatalog, Scope } from '@clumera/kernel';

/**
 * Actor para `can()`: sus roles asignados con su ámbito, más el rol implícito `member`
 * si tiene una membresía social activa. Una persona, varias participaciones.
 */
export async function loadActor(db: PrismaClient, personId: string, today = new Date()): Promise<Actor> {
  const [assignments, membership] = await Promise.all([
    db.roleAssignment.findMany({ where: { personId, active: true } }),
    db.clubMembership.findFirst({
      where: { personId, status: 'active', validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
      select: { id: true },
    }),
  ]);
  const list = assignments.map((a) => ({
    role: a.roleCode,
    scope: (a.scopeType === 'club' ? { type: 'club', id: null } : { type: a.scopeType, id: a.scopeId }) as Scope,
  }));
  if (membership && !list.some((a) => a.role === 'member')) list.push({ role: 'member', scope: { type: 'club', id: null } });
  return { personId, assignments: list };
}

/** Catálogo de roles de la instalación, leído de la base. */
export async function loadRoleCatalog(db: PrismaClient): Promise<RoleCatalog> {
  const roles = await db.role.findMany();
  return Object.fromEntries(roles.map((r) => [r.code, r.permissions]));
}

/**
 * Sincroniza los roles base del sistema (los trae la app desde el catálogo). Actualiza permisos
 * de los roles de sistema y nunca toca roles creados por el club.
 */
export async function syncBaseRoles(db: PrismaClient, roles: Record<string, readonly string[]>, names: Record<string, string> = {}): Promise<void> {
  for (const [code, permissions] of Object.entries(roles))
    await db.role.upsert({
      where: { code },
      create: { code, name: names[code] ?? code, permissions: [...permissions], system: true },
      update: { permissions: [...permissions], system: true, ...(names[code] ? { name: names[code] } : {}) },
    });
}
