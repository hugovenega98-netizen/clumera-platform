import { catalog } from '@clumera/catalog';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// Licencia sin módulos: solo el core.
vi.mock('@/lib/license', () => ({ getLicenseState: async () => ({ enabled: catalog.resolveEnabled([]) }) }));
vi.mock('@/lib/services', () => ({ getCredentials: () => { throw new Error('no debería llegar'); } }));
vi.mock('@/lib/authz', () => ({ authorize: vi.fn() }));
vi.mock('@/lib/client-config', () => ({ clientConfig: { identity: { displayName: 'Club' } } }));
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

  const ctxA = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
  const reqA = (path: string, method = 'GET', body?: unknown) => new Request(`http://localhost${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const [name, call] of [
    ['inscribir en una escuela', async () => (await import('../app/api/m/schools/enrollments/route')).POST(reqA('/api/m/schools/enrollments', 'POST', { groupId: 'x', personId: 'x' }))],
    ['baja de una escuela', async () => (await import('../app/api/m/schools/enrollments/[id]/withdraw/route')).POST(reqA('/api/m/schools/enrollments/x/withdraw', 'POST', { reason: 'xxxx' }), ctxA({ id: 'x' }))],
    ['nueva propuesta', async () => (await import('../app/api/m/schools/programs/route')).POST(reqA('/api/m/schools/programs', 'POST', {}))],
    ['nuevo grupo', async () => (await import('../app/api/m/schools/programs/[id]/groups/route')).POST(reqA('/api/m/schools/programs/x/groups', 'POST', {}), ctxA({ id: 'x' }))],
    ['emitir cuotas de escuelas', async () => (await import('../app/api/m/schools/fees/route')).POST(reqA('/api/m/schools/fees', 'POST', { period: '2026-11' }))],
    ['tomar asistencia', async () => (await import('../app/api/m/schools/groups/[id]/attendance/route')).POST(reqA('/api/m/schools/groups/x/attendance', 'POST', {}), ctxA({ id: 'x' }))],
    ['inscribir en la colonia', async () => (await import('../app/api/m/summer/enrollments/route')).POST(reqA('/api/m/summer/enrollments', 'POST', { groupId: 'x', personId: 'x' }))],
    ['baja de la colonia', async () => (await import('../app/api/m/summer/enrollments/[id]/withdraw/route')).POST(reqA('/api/m/summer/enrollments/x/withdraw', 'POST', { reason: 'xxxx' }), ctxA({ id: 'x' }))],
    ['subir un documento de la colonia', async () => (await import('../app/api/m/summer/enrollments/[id]/documents/[code]/route')).POST(reqA('/api/m/summer/enrollments/x/documents/apto', 'POST'), ctxA({ id: 'x', code: 'apto' }))],
    ['datos de emergencia de la colonia', async () => (await import('../app/api/m/summer/enrollments/[id]/details/route')).PUT(reqA('/api/m/summer/enrollments/x/details', 'PUT', {}), ctxA({ id: 'x' }))],
    ['revisar un documento de la colonia', async () => (await import('../app/api/m/summer/documents/[id]/review/route')).POST(reqA('/api/m/summer/documents/x/review', 'POST', { approve: true }), ctxA({ id: 'x' }))],
    ['crear un torneo', async () => (await import('../app/api/m/tournaments/route')).POST(reqA('/api/m/tournaments', 'POST', {}))],
    ['inscribir un equipo', async () => (await import('../app/api/m/tournaments/[id]/teams/route')).POST(reqA('/api/m/tournaments/x/teams', 'POST', { name: 'Rayo' }), ctxA({ id: 'x' }))],
    ['baja de un equipo', async () => (await import('../app/api/m/tournaments/teams/[id]/withdraw/route')).POST(reqA('/api/m/tournaments/teams/x/withdraw', 'POST'), ctxA({ id: 'x' }))],
    ['sortear el torneo', async () => (await import('../app/api/m/tournaments/[id]/draw/route')).POST(reqA('/api/m/tournaments/x/draw', 'POST'), ctxA({ id: 'x' }))],
    ['armar la eliminación', async () => (await import('../app/api/m/tournaments/[id]/knockout/route')).POST(reqA('/api/m/tournaments/x/knockout', 'POST'), ctxA({ id: 'x' }))],
    ['cargar un resultado', async () => (await import('../app/api/m/tournaments/matches/[id]/result/route')).PUT(reqA('/api/m/tournaments/matches/x/result', 'PUT', { homeScore: 1, awayScore: 0 }), ctxA({ id: 'x' }))],
    ['validar en un punto (Recepción)', async () => (await import('../app/api/m/access/check/route')).POST(reqA('/api/m/access/check', 'POST', { pointId: 'x', token: 'x' }))],
    ['excepción autorizada', async () => (await import('../app/api/m/access/attempts/[id]/override/route')).POST(reqA('/api/m/access/attempts/x/override', 'POST', { reason: 'xxxxx' }), ctxA({ id: 'x' }))],
    ['buscar persona en Recepción', async () => (await import('../app/api/m/access/people/route')).GET(reqA('/api/m/access/people?q=ana'))],
  ] as const) {
    it(`${name} responde 403 antes de mirar la sesión`, async () => {
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('module_not_licensed');
      expect(session).not.toHaveBeenCalled();
    });
  }
});

describe('Reservas e Instalaciones con la licencia apagada', () => {
  const req = (url: string, method = 'GET', body?: unknown) => new Request(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
  const cases: Array<[string, () => Promise<Response>]> = [
    ['turnos de un día', async () => (await import('../app/api/m/bookings/availability/route')).GET(req('/api/m/bookings/availability?espacio=x&dia=2026-11-21'))],
    ['reservar', async () => (await import('../app/api/m/bookings/route')).POST(req('/api/m/bookings', 'POST', {}))],
    ['cancelar una reserva', async () => (await import('../app/api/m/bookings/[id]/cancel/route')).POST(req('/api/m/bookings/x/cancel', 'POST', {}), ctx({ id: 'x' }))],
    ['reservar sin cuenta', async () => (await import('../app/api/m/bookings/public/route')).POST(req('/api/m/bookings/public', 'POST', {}))],
    ['pagar con el enlace de la reserva', async () => (await import('../app/api/m/bookings/public/[token]/pay/route')).POST(req('/api/m/bookings/public/x.y/pay', 'POST', {}), ctx({ token: 'x.y' }))],
    ['cancelar con el enlace de la reserva', async () => (await import('../app/api/m/bookings/public/[token]/cancel/route')).POST(req('/api/m/bookings/public/x.y/cancel', 'POST', {}), ctx({ token: 'x.y' }))],
    ['QR de una reserva propia', async () => (await import('../app/api/m/bookings/[id]/qr/route')).GET(req('/api/m/bookings/x/qr'), ctx({ id: 'x' }))],
    ['QR con el enlace de la reserva', async () => (await import('../app/api/m/bookings/public/[token]/qr/route')).GET(req('/api/m/bookings/public/x.y/qr'), ctx({ token: 'x.y' }))],
    ['reserva fija', async () => (await import('../app/api/m/bookings/series/route')).POST(req('/api/m/bookings/series', 'POST', {}))],
    ['cancelar reserva fija', async () => (await import('../app/api/m/bookings/series/[id]/cancel/route')).POST(req('/api/m/bookings/series/x/cancel', 'POST', {}), ctx({ id: 'x' }))],
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
