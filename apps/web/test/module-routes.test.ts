import { catalog } from '@clumera/catalog';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// Licencia sin módulos: solo el core.
vi.mock('@/lib/license', () => ({ getLicenseState: async () => ({ enabled: catalog.resolveEnabled([]) }) }));
vi.mock('@/lib/services', () => ({ getCredentials: () => { throw new Error('no debería llegar'); } }));
vi.mock('@/lib/authz', () => ({ authorize: vi.fn() }));
const session = vi.hoisted(() => vi.fn());
vi.mock('@/lib/session', () => ({ getCurrentSession: session }));

/** Cada ruta de módulo llama a requireModule(): con la licencia apagada responde 403 aunque se saltee el proxy. */
describe('rutas de módulo con la licencia apagada', () => {
  it('validar un acceso (Accesos) responde 403 antes de mirar la sesión', async () => {
    const { POST } = await import('../app/api/m/access/validate/route');
    const res = await POST(new Request('http://localhost/api/m/access/validate', { method: 'POST', body: '{"token":"x"}' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('module_not_licensed');
    expect(session).not.toHaveBeenCalled();
  });
});

describe('Reservas e Instalaciones con la licencia apagada', () => {
  const req = (url: string, method = 'GET', body?: unknown) => new Request(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const ctx = (params: { id: string }) => ({ params: Promise.resolve(params) });
  const cases: Array<[string, () => Promise<Response>]> = [
    ['turnos de un día', async () => (await import('../app/api/m/bookings/availability/route')).GET(req('/api/m/bookings/availability?espacio=x&dia=2026-11-21'))],
    ['reservar', async () => (await import('../app/api/m/bookings/route')).POST(req('/api/m/bookings', 'POST', {}))],
    ['cancelar una reserva', async () => (await import('../app/api/m/bookings/[id]/cancel/route')).POST(req('/api/m/bookings/x/cancel', 'POST', {}), ctx({ id: 'x' }))],
    ['alta de espacio', async () => (await import('../app/api/m/facilities/venues/route')).POST(req('/api/m/facilities/venues', 'POST', {}))],
    ['estado de un espacio', async () => (await import('../app/api/m/facilities/venues/[id]/route')).PATCH(req('/api/m/facilities/venues/x', 'PATCH', {}), ctx({ id: 'x' }))],
    ['reglas', async () => (await import('../app/api/m/facilities/venues/[id]/rule/route')).PUT(req('/api/m/facilities/venues/x/rule', 'PUT', {}), ctx({ id: 'x' }))],
    ['tarifa nueva', async () => (await import('../app/api/m/facilities/venues/[id]/tariffs/route')).POST(req('/api/m/facilities/venues/x/tariffs', 'POST', {}), ctx({ id: 'x' }))],
    ['quitar tarifa', async () => (await import('../app/api/m/facilities/tariffs/[id]/route')).DELETE(req('/api/m/facilities/tariffs/x', 'DELETE'), ctx({ id: 'x' }))],
    ['bloqueo', async () => (await import('../app/api/m/facilities/blocks/route')).POST(req('/api/m/facilities/blocks', 'POST', {}))],
    ['quitar bloqueo', async () => (await import('../app/api/m/facilities/blocks/[id]/route')).DELETE(req('/api/m/facilities/blocks/x', 'DELETE'), ctx({ id: 'x' }))],
  ];
  for (const [name, call] of cases)
    it(`${name}: 403 module_not_licensed sin mirar la sesión`, async () => {
      session.mockClear();
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('module_not_licensed');
      expect(session).not.toHaveBeenCalled();
    });
});
