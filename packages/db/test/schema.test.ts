import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)), 'utf8');

describe('esquema', () => {
  it('no guarda el documento en claro', () => {
    expect(schema).not.toMatch(/^\s+(dni|document|docNumber)\s/im);
    expect(schema).toMatch(/docDigest\s+String\?\s+@unique/);
  });

  it('guarda tokens de sesión y activación solo como hash', () => {
    expect(schema).toMatch(/model Session \{[\s\S]*?tokenHash\s+String\s+@unique/);
    expect(schema).toMatch(/model ActivationToken \{[\s\S]*?tokenHash\s+String\s+@unique/);
  });

  it('deduplica avisos por acontecimiento', () => {
    expect(schema).toMatch(/@@unique\(\[personId, eventKey\]\)/);
  });
});
