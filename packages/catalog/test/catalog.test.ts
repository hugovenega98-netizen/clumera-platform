import { describe, expect, it } from 'vitest';
import { can, moduleOfAction, type Actor } from '@clumera/kernel';
import { baseRoles, catalog, moduleManifests } from '../src';

describe('catálogo', () => {
  it('tiene ocho módulos licenciables y los core siempre encendidos', () => {
    expect(moduleManifests).toHaveLength(8);
    expect([...catalog.resolveEnabled([])].sort()).toEqual(['finance', 'identity', 'notifications', 'sports']);
  });

  it('cada permiso de rol apunta a un módulo y permiso existentes', () => {
    const declared = new Set(catalog.all.flatMap((m) => m.permissions));
    const ids = new Set(catalog.all.map((m) => m.id));
    for (const [role, perms] of Object.entries(baseRoles))
      for (const p of perms) {
        if (p === '*') continue;
        const base = p.replace(/:self$/, '');
        const mod = moduleOfAction(base.replace(/:\*$/, ':x'));
        expect(mod && ids.has(mod), `${role}: ${p}`).toBe(true);
        if (!base.endsWith(':*')) expect(declared.has(base), `${role}: ${p}`).toBe(true);
      }
  });

  it('Recepción no ve deuda ni salud; Coach no ve salud', () => {
    const ctx = { enabledModules: catalog.resolveEnabled(['access']), roles: baseRoles };
    const reception: Actor = { personId: 'r', assignments: [{ role: 'reception', scope: { type: 'club', id: null } }] };
    const coach: Actor = { personId: 'c', assignments: [{ role: 'coach', scope: { type: 'club', id: null } }] };
    expect(can(ctx, reception, 'access:validate').allowed).toBe(true);
    expect(can(ctx, reception, 'finance:account.view').allowed).toBe(false);
    expect(can(ctx, reception, 'sports:health.view').allowed).toBe(false);
    expect(can(ctx, coach, 'sports:health.view').allowed).toBe(false);
  });
});
