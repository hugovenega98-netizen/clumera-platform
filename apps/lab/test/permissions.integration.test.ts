import { catalog } from '@clumera/catalog';
import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { createDevMailer } from '@clumera/mail';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateMatrix } from '../src/permissions-eval';
import { PERMISSION_CASES } from '../src/permissions-matrix';
import { LAB_PROFILES } from '../src/profiles';
import { seedLab, wipeLab } from '../src/seed';

const url = testDatabaseUrl('lab');
const db = url ? createPrismaClient(url) : null;

describe('matriz de permisos', () => {
  it('cada caso nombra perfiles que existen', () => {
    const keys = new Set(LAB_PROFILES.map((p) => p.key));
    for (const c of PERMISSION_CASES) for (const k of c.allowed) expect(keys.has(k), `${c.id}: ${k}`).toBe(true);
  });
});

describe.skipIf(!db)('permisos con los perfiles de Lab sobre PostgreSQL', () => {
  const prisma = db!;
  beforeAll(async () => {
    await wipeLab(prisma);
    await seedLab(prisma, { publicOrigin: 'https://lab.test', clubName: 'Clumera Lab', mailer: createDevMailer(async () => {}) });
  });
  afterAll(() => prisma.$disconnect());

  const all = catalog.resolveEnabled(catalog.all.map((m) => m.id));

  it.each(PERMISSION_CASES.map((c) => [c.id, c] as const))('%s: autorizados y denegados', async (_id, c) => {
    const { rows } = await evaluateMatrix(prisma, all);
    const row = rows.find((r) => r.case.id === c.id)!;
    const allowed = row.cells.filter((x) => x.allowed).map((x) => x.profile).sort();
    expect(allowed).toEqual([...c.allowed].sort());
  });

  it('sin licencia del módulo nadie puede, ni siquiera superadmin', async () => {
    const coreOnly = catalog.resolveEnabled([]);
    const { rows } = await evaluateMatrix(prisma, coreOnly);
    for (const id of ['access', 'venues', 'sell', 'tournaments']) {
      const row = rows.find((r) => r.case.id === id)!;
      expect(row.cells.every((x) => !x.allowed && x.reason === 'module_not_licensed'), id).toBe(true);
    }
  });

  it('Recepción y Coach nunca ven salud ni deuda ajena', async () => {
    const { rows } = await evaluateMatrix(prisma, all);
    for (const id of ['health', 'other-account'])
      for (const p of ['recepcion', 'coach']) expect(rows.find((r) => r.case.id === id)!.cells.find((x) => x.profile === p)!.allowed, `${id}/${p}`).toBe(false);
  });
});
