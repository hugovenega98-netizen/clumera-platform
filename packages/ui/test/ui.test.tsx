import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button, Card, Notice } from '../src';

const stylesDir = fileURLToPath(new URL('../src/styles/', import.meta.url));

describe('ui', () => {
  it('los botones son type=button por defecto (no envían formularios sin querer)', () => {
    expect(renderToStaticMarkup(<Button>Pagar</Button>)).toBe('<button type="button" class="cx-btn cx-btn--primary">Pagar</button>');
  });

  it('Card y Notice renderizan con roles accesibles', () => {
    expect(renderToStaticMarkup(<Card title="Carnet">x</Card>)).toContain('<h2 class="cx-card__title">Carnet</h2>');
    expect(renderToStaticMarkup(<Notice tone="bad">Error</Notice>)).toContain('role="alert"');
  });

  it('los estilos no fijan colores de identidad fuera de las variables --client-*', () => {
    const tokens = readFileSync(`${stylesDir}tokens.css`, 'utf8');
    for (const [cx, client] of [['primary', 'primary'], ['button', 'button'], ['accent', 'accent'], ['bg', 'background'], ['text', 'text']])
      expect(tokens).toMatch(new RegExp(`--cx-${cx}: var\\(--client-${client},`));
    for (const file of readdirSync(stylesDir).filter((f) => f !== 'tokens.css'))
      expect(readFileSync(`${stylesDir}${file}`, 'utf8'), file).not.toMatch(/--client-/);
  });

  it('el objetivo táctil mínimo es 44 px', () => {
    expect(readFileSync(`${stylesDir}tokens.css`, 'utf8')).toMatch(/--cx-touch: 44px/);
  });
});
