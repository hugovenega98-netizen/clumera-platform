import type { ModuleId, ModuleRegistry } from '@clumera/kernel';

export type GuardDecision =
  | { action: 'next' }
  | { action: 'deny-api'; moduleId: ModuleId }
  | { action: 'deny-page'; moduleId: ModuleId };

/**
 * Decide si una ruta pertenece a un módulo apagado. Lo usan el proxy (primera barrera)
 * y cada Route Handler de módulo (segunda barrera, por si alguien llama la API directo).
 */
export function decideModuleAccess(pathname: string, registry: ModuleRegistry, enabled: ReadonlySet<ModuleId>): GuardDecision {
  const owner = registry.moduleForPath(pathname);
  if (!owner || enabled.has(owner.id)) return { action: 'next' };
  return pathname.startsWith('/api/') ? { action: 'deny-api', moduleId: owner.id } : { action: 'deny-page', moduleId: owner.id };
}

export function moduleNotLicensedBody(moduleId: ModuleId) {
  return { error: { code: 'module_not_licensed', message: 'Este módulo no está habilitado para el club', details: { module: moduleId } } };
}
