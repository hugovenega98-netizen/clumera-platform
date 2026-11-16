import { describe, expect, it } from 'vitest';
import { defineModule, ModuleRegistry, type ModuleManifest } from '../src';

const base = (over: Partial<ModuleManifest> & { id: string }): ModuleManifest => ({
  name: over.id,
  version: '1.0.0',
  kind: 'module',
  dependsOn: [],
  permissions: [],
  routes: [],
  nav: [],
  homeCards: [],
  emits: [],
  listens: [],
  ...over,
});

describe('defineModule', () => {
  it('rechaza permisos que no son del módulo', () => {
    expect(() => defineModule(base({ id: 'bookings', permissions: ['finance:refund'] }))).toThrow(/bookings:/);
  });
  it('rechaza ítems de navegación con permisos no declarados', () => {
    expect(() =>
      defineModule(base({ id: 'store', nav: [{ id: 'x', label: 'X', href: '/x', space: 'admin', permission: 'store:manage' }] })),
    ).toThrow(/no declarado/);
  });
});

describe('ModuleRegistry', () => {
  const registry = new ModuleRegistry([
    base({ id: 'identity', kind: 'core', routes: ['/api/identity'] }),
    base({ id: 'facilities', routes: ['/api/m/facilities'] }),
    base({ id: 'bookings', dependsOn: ['facilities'], routes: ['/api/m/bookings', '/reservas'] }),
    base({ id: 'store', routes: ['/api/m/store'] }),
  ]);

  it('enciende core siempre y solo los módulos licenciados', () => {
    expect([...registry.resolveEnabled(['store'])].sort()).toEqual(['identity', 'store']);
  });

  it('apaga un módulo licenciado si su dependencia no está licenciada', () => {
    expect(registry.resolveEnabled(['bookings']).has('bookings')).toBe(false);
    expect(registry.resolveEnabled(['bookings', 'facilities']).has('bookings')).toBe(true);
  });

  it('encuentra el módulo dueño de una ruta sin confundir prefijos parciales', () => {
    expect(registry.moduleForPath('/api/m/bookings/123')?.id).toBe('bookings');
    expect(registry.moduleForPath('/reservas')?.id).toBe('bookings');
    expect(registry.moduleForPath('/reservasx')).toBeUndefined();
    expect(registry.moduleForPath('/api/m/storefront')).toBeUndefined();
  });

  it('detecta dependencias faltantes, ciclos y rutas duplicadas', () => {
    expect(() => new ModuleRegistry([base({ id: 'a1', dependsOn: ['zz'] })])).toThrow(/no está en el catálogo/);
    expect(() => new ModuleRegistry([base({ id: 'a1', dependsOn: ['b1'] }), base({ id: 'b1', dependsOn: ['a1'] })])).toThrow(/Ciclo/);
    expect(() => new ModuleRegistry([base({ id: 'a1', routes: ['/x'] }), base({ id: 'b1', routes: ['/x'] })])).toThrow(/declarada/);
  });
});
