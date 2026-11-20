/**
 * Autorización con ámbito: licencia del módulo + rol + alcance, evaluada siempre en el servidor.
 * La navegación usa lo mismo para esconder lo que no corresponde, pero esconder no es autorizar.
 */
import type { ModuleId } from './modules';

export type ScopeType = 'club' | 'sport' | 'team' | 'venue' | 'resource' | 'event' | 'activity';

export interface Scope {
  type: ScopeType;
  /** null solo para `club`: el club entero de esta instalación. */
  id: string | null;
}

export const CLUB_SCOPE: Scope = Object.freeze({ type: 'club', id: null });

export interface RoleAssignment {
  role: string;
  scope: Scope;
}

export interface Actor {
  personId: string;
  assignments: RoleAssignment[];
}

/**
 * Recurso sobre el que se actúa. `scopes` es la cadena de ámbitos que lo contienen,
 * por ejemplo [club, sport:rugby, team:m19]. El club siempre se agrega solo.
 */
export interface Resource {
  scopes: Scope[];
  /** Dueño del recurso; habilita acciones `self` (ver mis pagos, mi carnet). */
  ownerPersonIds?: string[];
}

/** Rol → permisos. Admite comodín de módulo (`sports:*`) y total (`*`). Un sufijo `:self` restringe al dueño. */
export type RoleCatalog = Record<string, readonly string[]>;

export interface AuthorizationContext {
  enabledModules: ReadonlySet<ModuleId>;
  roles: RoleCatalog;
}

export type Decision =
  | { allowed: true; via: { role: string; scope: Scope } | 'self' }
  | { allowed: false; reason: 'module_not_licensed' | 'no_role' | 'out_of_scope' | 'invalid_action' };

const ACTION = /^([a-z][a-z0-9-]*):([a-z][a-z0-9_.-]*)$/;

export function moduleOfAction(action: string): ModuleId | null {
  return ACTION.exec(action)?.[1] ?? null;
}

/**
 * Acciones que ningún comodín concede (`*`, `sports:*`): hay que tenerlas asignadas por su nombre.
 * Los datos clínicos son de quien atiende la salud, no del administrador general (como en el core
 * anterior: «el administrador general no tiene acceso al historial clínico»).
 */
export const EXPLICIT_ONLY_ACTIONS: ReadonlySet<string> = new Set(['sports:health.view', 'summer:document.sensitive.view']);

function grants(permission: string, action: string, moduleId: string): 'full' | 'self' | false {
  const self = permission.endsWith(':self');
  const base = self ? permission.slice(0, -':self'.length) : permission;
  const hit = base === action || (!EXPLICIT_ONLY_ACTIONS.has(action) && (base === '*' || base === `${moduleId}:*`));
  if (!hit) return false;
  return self ? 'self' : 'full';
}

function scopeCovers(assigned: Scope, chain: Scope[]): boolean {
  if (assigned.type === 'club') return true;
  return chain.some((s) => s.type === assigned.type && s.id === assigned.id);
}

export function can(ctx: AuthorizationContext, actor: Actor, action: string, resource: Resource = { scopes: [] }): Decision {
  const moduleId = moduleOfAction(action);
  if (!moduleId) return { allowed: false, reason: 'invalid_action' };
  if (!ctx.enabledModules.has(moduleId)) return { allowed: false, reason: 'module_not_licensed' };

  const chain = [CLUB_SCOPE, ...resource.scopes];
  const isOwner = resource.ownerPersonIds?.includes(actor.personId) ?? false;
  let hadRole = false;

  for (const assignment of actor.assignments) {
    for (const permission of ctx.roles[assignment.role] ?? []) {
      const g = grants(permission, action, moduleId);
      if (!g) continue;
      hadRole = true;
      if (g === 'self') {
        if (isOwner) return { allowed: true, via: 'self' };
        continue;
      }
      if (scopeCovers(assignment.scope, chain)) return { allowed: true, via: { role: assignment.role, scope: assignment.scope } };
    }
  }
  return { allowed: false, reason: hadRole ? 'out_of_scope' : 'no_role' };
}
