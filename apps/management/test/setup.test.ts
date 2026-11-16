import { verifyPassword } from '@clumera/identity';
import { afterEach, describe, expect, it } from 'vitest';
import { hashAdminPassword } from '../app/configurar/actions';

const form = (password: string, confirm = password) => {
  const f = new FormData();
  f.set('password', password);
  f.set('confirm', confirm);
  return f;
};
const empty = { hash: null, problems: [] };

describe('configuración inicial de Management', () => {
  afterEach(() => {
    delete process.env.MANAGEMENT_ADMIN_PASSWORD_HASH;
  });

  it('devuelve un hash verificable y no guarda nada', async () => {
    const r = await hashAdminPassword(empty, form('frase larga de administración'));
    expect(r.problems).toEqual([]);
    expect(await verifyPassword('frase larga de administración', r.hash!)).toBe(true);
  });

  it('valida la contraseña y que coincidan', async () => {
    expect((await hashAdminPassword(empty, form('corta'))).hash).toBeNull();
    expect((await hashAdminPassword(empty, form('frase larga uno', 'frase larga dos'))).problems).toEqual(['Las contraseñas no coinciden.']);
  });

  it('deja de funcionar cuando la contraseña ya está configurada', async () => {
    process.env.MANAGEMENT_ADMIN_PASSWORD_HASH = 'scrypt$x';
    const r = await hashAdminPassword(empty, form('frase larga de administración'));
    expect(r.hash).toBeNull();
    expect(r.problems[0]).toMatch(/ya está configurada/);
  });
});
