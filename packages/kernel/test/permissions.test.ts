import { describe, expect, it } from 'vitest';
import { can, type Actor, type AuthorizationContext } from '../src';

const ctx: AuthorizationContext = {
  enabledModules: new Set(['sports', 'finance', 'access']),
  roles: {
    superadmin: ['*'],
    coach: ['sports:lineup.edit', 'sports:attendance.mark'],
    accounting: ['finance:*'],
    member: ['finance:account.view:self'],
    reception: ['access:validate'],
    shop: ['store:sell'],
  },
};

const coachM19: Actor = { personId: 'p_coach', assignments: [{ role: 'coach', scope: { type: 'team', id: 'm19' } }] };
const rugby = { type: 'sport', id: 'rugby' } as const;

describe('can', () => {
  it('permite al coach actuar sobre su equipo y no sobre otro', () => {
    expect(can(ctx, coachM19, 'sports:lineup.edit', { scopes: [rugby, { type: 'team', id: 'm19' }] }).allowed).toBe(true);
    const other = can(ctx, coachM19, 'sports:lineup.edit', { scopes: [rugby, { type: 'team', id: 'm17' }] });
    expect(other).toEqual({ allowed: false, reason: 'out_of_scope' });
  });

  it('el coach no ve finanzas', () => {
    expect(can(ctx, coachM19, 'finance:account.view')).toEqual({ allowed: false, reason: 'no_role' });
  });

  it('un rol de alcance club cubre todo el club', () => {
    const acc: Actor = { personId: 'p_acc', assignments: [{ role: 'accounting', scope: { type: 'club', id: null } }] };
    expect(can(ctx, acc, 'finance:refund.issue', { scopes: [rugby] }).allowed).toBe(true);
  });

  it('un permiso :self solo vale para el dueño del recurso', () => {
    const socio: Actor = { personId: 'p_1', assignments: [{ role: 'member', scope: { type: 'club', id: null } }] };
    expect(can(ctx, socio, 'finance:account.view', { scopes: [], ownerPersonIds: ['p_1'] })).toEqual({ allowed: true, via: 'self' });
    expect(can(ctx, socio, 'finance:account.view', { scopes: [], ownerPersonIds: ['p_2'] }).allowed).toBe(false);
  });

  it('ni siquiera superadmin opera un módulo sin licencia', () => {
    const admin: Actor = { personId: 'p_admin', assignments: [{ role: 'superadmin', scope: { type: 'club', id: null } }] };
    expect(can(ctx, admin, 'store:sell')).toEqual({ allowed: false, reason: 'module_not_licensed' });
    expect(can(ctx, admin, 'sports:lineup.edit').allowed).toBe(true);
  });

  it('rechaza acciones mal formadas', () => {
    expect(can(ctx, coachM19, 'lineup')).toEqual({ allowed: false, reason: 'invalid_action' });
  });
});
