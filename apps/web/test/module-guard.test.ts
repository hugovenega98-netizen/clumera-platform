import { catalog } from '@clumera/catalog';
import { describe, expect, it } from 'vitest';
import { decideModuleAccess } from '@/lib/module-guard';
import { navigationFor } from '@/lib/navigation';

const coreOnly = catalog.resolveEnabled([]);
const withBookings = catalog.resolveEnabled(['facilities', 'bookings']);

describe('barrera de módulos', () => {
  it('la API de un módulo sin licencia responde 403 (criterio de la Fase 0)', () => {
    expect(decideModuleAccess('/api/m/bookings/slots', catalog, coreOnly)).toEqual({ action: 'deny-api', moduleId: 'bookings' });
    expect(decideModuleAccess('/api/m/store', catalog, withBookings)).toEqual({ action: 'deny-api', moduleId: 'store' });
  });

  it('las páginas de un módulo apagado van a «no disponible»', () => {
    expect(decideModuleAccess('/reservas', catalog, coreOnly)).toEqual({ action: 'deny-page', moduleId: 'bookings' });
  });

  it('deja pasar módulos licenciados, core y rutas sin dueño', () => {
    expect(decideModuleAccess('/api/m/bookings/slots', catalog, withBookings)).toEqual({ action: 'next' });
    expect(decideModuleAccess('/api/finance/charges', catalog, coreOnly)).toEqual({ action: 'next' });
    expect(decideModuleAccess('/', catalog, coreOnly)).toEqual({ action: 'next' });
  });
});

describe('navegación por manifiestos', () => {
  it('muestra solo lo encendido y visible', () => {
    const ids = (enabled: ReadonlySet<string>, visible: string[]) => navigationFor('member', catalog, enabled, visible).map((n) => n.href);
    expect(ids(coreOnly, ['bookings'])).not.toContain('/reservas');
    expect(ids(withBookings, [])).not.toContain('/reservas');
    expect(ids(withBookings, ['bookings'])).toContain('/reservas');
    expect(ids(coreOnly, [])).toEqual(expect.arrayContaining(['/carnet', '/pagos', '/avisos']));
  });
});
