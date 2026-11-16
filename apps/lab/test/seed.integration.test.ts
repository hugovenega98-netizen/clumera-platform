import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { createDevMailer, type MailMessage } from '@clumera/mail';
import { afterAll, describe, expect, it } from 'vitest';
import { assertLabTarget } from '../src/guard';
import { LAB_PROFILES } from '../src/profiles';
import { seedLab, wipeLab } from '../src/seed';

const url = testDatabaseUrl('lab');
const db = url ? createPrismaClient(url) : null;
const labEnv = { CLUMERA_LAB: '1', LAB_DATABASE_NAME: 'clumera_test_lab' };

describe.skipIf(!db)('Lab sobre PostgreSQL', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const mails: MailMessage[] = [];
  const seed = () => seedLab(prisma, { publicOrigin: 'https://lab.clumera.app', clubName: 'Clumera Lab', mailer: createDevMailer(async (m) => void mails.push(m)) });

  it('se niega a operar fuera de su base o sin CLUMERA_LAB', async () => {
    await expect(assertLabTarget(prisma, {})).rejects.toThrow(/CLUMERA_LAB/);
    await expect(assertLabTarget(prisma, { ...labEnv, LAB_DATABASE_NAME: 'club_rugby' })).rejects.toThrow(/clumera_lab/);
    await expect(assertLabTarget(prisma, { ...labEnv, LAB_DATABASE_NAME: 'clumera_lab' })).rejects.toThrow(/no es la de Lab/);
    await expect(assertLabTarget(prisma, labEnv, 'club-rugby')).rejects.toThrow(/clumera-lab/);
    await expect(assertLabTarget(prisma, labEnv, 'clumera-lab')).resolves.toBeUndefined();
  });

  it('siembra todos los perfiles y es restaurable', async () => {
    await wipeLab(prisma);
    await seed();
    const first = await prisma.person.count();
    expect(await prisma.userAccount.count({ where: { status: 'active' } })).toBe(LAB_PROFILES.length);
    expect(await prisma.userAccount.count({ where: { status: 'pending' } })).toBe(1);
    expect(mails.at(-1)?.text).toContain('https://lab.clumera.app/activar?token=');
    expect(await prisma.role.count()).toBe(12);
    // Restaurar deja exactamente el mismo estado base.
    await prisma.person.create({ data: { firstName: 'Visitante', lastName: 'Demo' } });
    await wipeLab(prisma);
    await seed();
    expect(await prisma.person.count()).toBe(first);
    // El historial de migraciones sobrevive.
    expect((await prisma.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM _prisma_migrations`)[0]!.n).toBeGreaterThan(0);
  });
});
