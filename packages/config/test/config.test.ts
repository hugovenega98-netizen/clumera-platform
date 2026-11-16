import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildWebManifest, clientCssText, clientCssVariables, contrastRatio, parseClientConfig, publicOrigin } from '../src';

const example = JSON.parse(readFileSync(fileURLToPath(new URL('../../../client.config.example.json', import.meta.url)), 'utf8'));
const clone = () => structuredClone(example);
const problemsOf = (input: unknown) => {
  const r = parseClientConfig(input);
  return r.ok ? [] : ((r.error.details?.problems as string[]) ?? []);
};

describe('parseClientConfig', () => {
  it('acepta el ejemplo del repo', () => {
    expect(parseClientConfig(example).ok).toBe(true);
  });

  it('señala campos inválidos con mensajes en español', () => {
    const c = clone();
    c.colors.primary = 'azul';
    c.identity.clientId = 'Club Ejemplo';
    c.assets.logo = '/branding/../secreto.png';
    const p = problemsOf(c);
    expect(p.some((m) => m.startsWith('colors.primary'))).toBe(true);
    expect(p.some((m) => m.startsWith('identity.clientId'))).toBe(true);
    expect(p.some((m) => m.startsWith('assets.logo'))).toBe(true);
  });

  it('rechaza secretos en cualquier nivel y campos desconocidos', () => {
    expect(problemsOf({ ...clone(), pwa: { ...example.pwa, vapid: 'x' } })[0]).toMatch(/pwa\.vapid/);
    expect(parseClientConfig({ ...clone(), extra: true }).ok).toBe(false);
  });

  it('exige contraste AA en los pares de texto principales', () => {
    const c = clone();
    c.colors.button = '#8fd3ff';
    expect(problemsOf(c).some((m) => m.includes('botones'))).toBe(true);
  });

  it('rechaza módulos visibles repetidos', () => {
    const c = clone();
    c.modules.visible = ['bookings', 'bookings'];
    expect(problemsOf(c).some((m) => m.includes('repetido'))).toBe(true);
  });
});

describe('branding', () => {
  const cfg = (() => {
    const r = parseClientConfig(example);
    if (!r.ok) throw r.error;
    return r.value;
  })();

  it('genera variables --client-* en kebab-case', () => {
    const vars = clientCssVariables(cfg);
    expect(vars['--client-primary-deep']).toBe('#132033');
    expect(clientCssText(cfg)).toMatch(/^:root\{--client-primary:#1f3149;/);
  });

  it('arma el manifiesto de la PWA con la identidad del club', () => {
    const m = buildWebManifest(cfg);
    expect(m.short_name).toBe('Ejemplo');
    expect(m.theme_color).toBe('#1f3149');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    expect(m.display).toBe('standalone');
  });

  it('usa el dominio propio solo si fue contratado', () => {
    expect(publicOrigin(cfg)).toBe('https://ejemplo.clumera.app');
    expect(publicOrigin({ ...cfg, domain: { subdomain: 'ejemplo', customDomain: 'app.clubejemplo.com.ar' } })).toBe('https://app.clubejemplo.com.ar');
  });

  it('calcula contraste WCAG', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
});
