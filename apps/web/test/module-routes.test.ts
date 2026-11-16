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
