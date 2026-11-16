/**
 * Manifiestos de módulo. Cada módulo declara qué necesita y qué aporta; el core arma
 * navegación, inicio y bloqueo de API a partir de esto. Si el club no tiene el módulo,
 * no aparece nada y su API responde 403.
 */
export type ModuleId = string;

/** Espacios entre los que la persona cambia sin cambiar de identidad. */
export type NavSpace = 'member' | 'sports' | 'coach' | 'facilities' | 'operations' | 'admin';

export interface NavItem {
  id: string;
  label: string;
  href: string;
  space: NavSpace;
  /** Permiso requerido para mostrar el ítem; la autorización real la hace el servidor. */
  permission?: string;
}

export interface HomeCard {
  id: string;
  title: string;
  space: NavSpace;
  permission?: string;
}

export interface ModuleManifest {
  id: ModuleId;
  name: string;
  version: string;
  /** `core` siempre está encendido; `module` necesita licencia. */
  kind: 'core' | 'module';
  /** Otros módulos que deben estar encendidos. Solo se declaran, nunca se importan. */
  dependsOn: ModuleId[];
  /** Permisos que define el módulo, con forma `<modulo>:<accion>`. */
  permissions: string[];
  /** Prefijos de ruta que pertenecen al módulo (API y páginas). */
  routes: string[];
  nav: NavItem[];
  homeCards: HomeCard[];
  /** Eventos de dominio que emite y que escucha. */
  emits: string[];
  listens: string[];
}

const MODULE_ID = /^[a-z][a-z0-9-]{1,30}$/;

export function defineModule(manifest: ModuleManifest): ModuleManifest {
  const problems = validateManifest(manifest);
  if (problems.length) throw new Error(`Manifiesto inválido de ${manifest.id}: ${problems.join('; ')}`);
  return Object.freeze(manifest);
}

export function validateManifest(m: ModuleManifest): string[] {
  const problems: string[] = [];
  if (!MODULE_ID.test(m.id)) problems.push('id: usá minúsculas, números y guiones');
  if (!/^\d+\.\d+\.\d+$/.test(m.version)) problems.push('version: usá semver x.y.z');
  for (const p of m.permissions) if (!p.startsWith(`${m.id}:`)) problems.push(`permiso ${p} debe empezar con ${m.id}:`);
  for (const r of m.routes) if (!r.startsWith('/')) problems.push(`ruta ${r} debe empezar con /`);
  for (const item of [...m.nav, ...m.homeCards])
    if (item.permission && !m.permissions.includes(item.permission))
      problems.push(`${item.id} usa el permiso no declarado ${item.permission}`);
  if (m.dependsOn.includes(m.id)) problems.push('no puede depender de sí mismo');
  return problems;
}

export class ModuleRegistry {
  readonly #byId: Map<ModuleId, ModuleManifest>;

  constructor(manifests: ModuleManifest[]) {
    this.#byId = new Map();
    for (const m of manifests) {
      if (this.#byId.has(m.id)) throw new Error(`Módulo duplicado: ${m.id}`);
      this.#byId.set(m.id, m);
    }
    for (const m of manifests)
      for (const dep of m.dependsOn)
        if (!this.#byId.has(dep)) throw new Error(`${m.id} depende de ${dep}, que no está en el catálogo`);
    this.#assertNoCycles();
    this.#assertDisjointRoutes();
  }

  get all(): ModuleManifest[] {
    return [...this.#byId.values()];
  }

  get(id: ModuleId): ModuleManifest | undefined {
    return this.#byId.get(id);
  }

  /**
   * Módulos efectivamente encendidos: los core siempre, y los licenciados cuyas
   * dependencias también estén encendidas. Un módulo con una dependencia apagada queda apagado.
   */
  resolveEnabled(licensed: Iterable<ModuleId>): Set<ModuleId> {
    const wanted = new Set(licensed);
    const enabled = new Set<ModuleId>();
    const visit = (id: ModuleId, stack: Set<ModuleId>): boolean => {
      if (enabled.has(id)) return true;
      const m = this.#byId.get(id);
      if (!m || stack.has(id)) return false;
      if (m.kind === 'module' && !wanted.has(id)) return false;
      stack.add(id);
      const depsOk = m.dependsOn.every((d) => visit(d, stack));
      stack.delete(id);
      if (depsOk) enabled.add(id);
      return depsOk;
    };
    for (const m of this.#byId.values()) visit(m.id, new Set());
    return enabled;
  }

  /** Módulo dueño de una ruta (el prefijo más largo gana). */
  moduleForPath(pathname: string): ModuleManifest | undefined {
    let best: ModuleManifest | undefined;
    let bestLen = -1;
    for (const m of this.#byId.values())
      for (const prefix of m.routes)
        if ((pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)) && prefix.length > bestLen) {
          best = m;
          bestLen = prefix.length;
        }
    return best;
  }

  #assertNoCycles() {
    const state = new Map<ModuleId, 'visiting' | 'done'>();
    const walk = (id: ModuleId, path: ModuleId[]) => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'visiting') throw new Error(`Ciclo de dependencias: ${[...path, id].join(' → ')}`);
      state.set(id, 'visiting');
      for (const d of this.#byId.get(id)?.dependsOn ?? []) walk(d, [...path, id]);
      state.set(id, 'done');
    };
    for (const id of this.#byId.keys()) walk(id, []);
  }

  #assertDisjointRoutes() {
    const owner = new Map<string, ModuleId>();
    for (const m of this.#byId.values())
      for (const r of m.routes) {
        const prev = owner.get(r);
        if (prev) throw new Error(`La ruta ${r} está declarada por ${prev} y ${m.id}`);
        owner.set(r, m.id);
      }
  }
}
