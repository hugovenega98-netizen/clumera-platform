import type { ModuleId, ModuleRegistry, NavItem, NavSpace } from '@clumera/kernel';

/**
 * Ítems de navegación de un espacio: solo módulos encendidos y, si no son core,
 * además marcados como visibles por el club. Esconder no autoriza: eso lo hace el servidor.
 */
export function navigationFor(
  space: NavSpace,
  registry: ModuleRegistry,
  enabled: ReadonlySet<ModuleId>,
  visible: readonly ModuleId[],
): Array<NavItem & { moduleId: ModuleId }> {
  return registry.all
    .filter((m) => enabled.has(m.id) && (m.kind === 'core' || visible.includes(m.id)))
    .flatMap((m) => m.nav.filter((n) => n.space === space).map((n) => ({ ...n, moduleId: m.id })));
}
