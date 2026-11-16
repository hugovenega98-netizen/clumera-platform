import type { PrismaClient } from '@clumera/db';
import { loadActor, loadRoleCatalog } from '@clumera/identity';
import { can, moduleOfAction, type ModuleId } from '@clumera/kernel';
import { PERMISSION_CASES, type PermissionCase } from './permissions-matrix';
import { LAB_PROFILES } from './profiles';

export interface MatrixCell {
  profile: string;
  allowed: boolean;
  expected: boolean;
  reason: string;
}

export interface MatrixRow {
  case: PermissionCase;
  cells: MatrixCell[];
}

/**
 * Evalúa la matriz con los perfiles reales de la base (roles, ámbitos y membresías sembrados) y
 * `can()` del kernel, el mismo que usa el servidor. `ok` es falso si algún resultado no coincide.
 */
export async function evaluateMatrix(db: PrismaClient, enabledModules: ReadonlySet<ModuleId>): Promise<{ rows: MatrixRow[]; ok: boolean }> {
  const roles = await loadRoleCatalog(db);
  const accounts = await db.userAccount.findMany({ where: { login: { in: LAB_PROFILES.map((p) => p.login) } }, select: { login: true, personId: true } });
  const personOf = new Map(accounts.map((a) => [a.login, a.personId]));
  const actors = new Map<string, Awaited<ReturnType<typeof loadActor>>>();
  for (const p of LAB_PROFILES) {
    const personId = personOf.get(p.login);
    if (!personId) throw new Error(`Falta el perfil ${p.key}: restaurá los datos base`);
    actors.set(p.key, await loadActor(db, personId));
  }
  let ok = true;
  const rows = PERMISSION_CASES.map((c) => ({
    case: c,
    cells: LAB_PROFILES.map((p) => {
      const actor = actors.get(p.key)!;
      const { owner, ...resource } = c.resource ?? { scopes: [] };
      const ownerIds = owner === 'self' ? [actor.personId] : owner === 'other' ? ['otra-persona'] : undefined;
      const d = can({ enabledModules, roles }, actor, c.action, { ...resource, ...(ownerIds ? { ownerPersonIds: ownerIds } : {}) });
      // Con el módulo sin licencia lo esperado es que nadie pueda.
      const licensed = enabledModules.has(moduleOfAction(c.action) ?? '');
      const expected = licensed && (c.allowed as string[]).includes(p.key);
      if (d.allowed !== expected) ok = false;
      return { profile: p.key, allowed: d.allowed, expected, reason: d.allowed ? (d.via === 'self' ? 'propio' : d.via.role) : d.reason };
    }),
  }));
  return { rows, ok };
}
