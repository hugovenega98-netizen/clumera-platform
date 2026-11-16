import { describe, expect, it } from 'vitest';
import { isCrossOriginWrite } from '@/lib/origin-check';
import { safeNext as safeNextForTest } from '@/lib/safe-next';

describe('protección CSRF por origen', () => {
  it('rechaza escrituras de otro origen o sin origen', () => {
    expect(isCrossOriginWrite('POST', '/api/auth/login', 'https://malo.com', 'lab.clumera.app')).toBe(true);
    expect(isCrossOriginWrite('POST', '/api/auth/login', null, 'lab.clumera.app')).toBe(true);
  });
  it('acepta el mismo origen, lecturas, webhooks y cron', () => {
    expect(isCrossOriginWrite('POST', '/api/auth/login', 'https://lab.clumera.app', 'lab.clumera.app')).toBe(false);
    expect(isCrossOriginWrite('GET', '/api/health', null, 'x')).toBe(false);
    expect(isCrossOriginWrite('POST', '/api/webhooks/mercadopago', null, 'x')).toBe(false);
    expect(isCrossOriginWrite('POST', '/api/cron/outbox', null, 'x')).toBe(false);
  });
});

describe('redirección después del ingreso', () => {
  it('solo acepta rutas internas', () => {
    expect(safeNextForTest('/cuenta')).toBe('/cuenta');
    expect(safeNextForTest('//malo.com')).toBe('/');
    expect(safeNextForTest('https://malo.com')).toBe('/');
    expect(safeNextForTest('/\\malo.com')).toBe('/');
  });
});
