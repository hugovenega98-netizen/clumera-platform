import { describe, expect, it } from 'vitest';
import { documentDigest, hashPassword, passwordProblems, verifyPassword } from '../src';

describe('contraseñas', () => {
  it('hashea con sal y verifica', async () => {
    const a = await hashPassword('una frase larga');
    const b = await hashPassword('una frase larga');
    expect(a).not.toBe(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('una frase larga', a)).toBe(true);
    expect(await verifyPassword('otra frase larga', a)).toBe(false);
    expect(await verifyPassword('x', 'basura')).toBe(false);
  });

  it('rechaza contraseñas cortas, obvias, numéricas o con el usuario', () => {
    expect(passwordProblems('corta')).toHaveLength(1);
    expect(passwordProblems('30111222333').join()).toMatch(/números/);
    expect(passwordProblems('aaaaaaaaaaaa').join()).toMatch(/adivinar/);
    expect(passwordProblems('anaperez2026!', { login: 'anaperez@club.app' }).join()).toMatch(/usuario/);
    expect(passwordProblems('mi club de los domingos')).toEqual([]);
  });
});

describe('documento', () => {
  it('guarda digest + últimos 4, estable ante puntos y espacios', () => {
    const pepper = 'pepper-de-prueba-123';
    const a = documentDigest('30.111.222', pepper);
    expect(a.docLast4).toBe('1222');
    expect(documentDigest('30111222', pepper).docDigest).toBe(a.docDigest);
    expect(a.docDigest).not.toContain('30111222');
    expect(() => documentDigest('30111222', 'corta')).toThrow(/PEPPER/);
  });
});
