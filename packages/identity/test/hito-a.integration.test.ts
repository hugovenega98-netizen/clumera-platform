import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCredentialService, familyView, isGuardianOf, loadActor, qrTokenFor, spacesFor, syncBaseRoles } from '../src';

const url = testDatabaseUrl('identity');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('Hito A · identidad sobre PostgreSQL', () => {
  const prisma = db!;
  let clock = new Date('2026-11-16T12:00:00Z');
  const creds = createCredentialService(prisma, () => clock);
  afterAll(() => prisma.$disconnect());

  let ana = '';
  let tomas = '';
  let pablo = '';
  beforeEach(async () => {
    clock = new Date('2026-11-16T12:00:00Z');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Person","Credential","ClubMembership","MembershipCategory","FamilyGroup","FamilyRelationship","Role","RoleAssignment","UserAccount" CASCADE',
    );
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo pleno' } });
    const mk = (firstName: string, extra = {}) => prisma.person.create({ data: { firstName, lastName: 'Gómez', ...extra } });
    ana = (await mk('Ana', { memberships: { create: { categoryId: cat.id, memberNumber: '4127', validFrom: new Date('2024-01-01') } }, account: { create: { login: 'ana', status: 'active' } } })).id;
    tomas = (await mk('Tomás', { birthDate: new Date('2014-05-10'), memberships: { create: { categoryId: cat.id, memberNumber: '4130', validFrom: new Date('2024-01-01') } } })).id;
    pablo = (await mk('Pablo', { account: { create: { login: 'pablo', status: 'active' } } })).id;
    await prisma.familyGroup.create({
      data: {
        name: 'Familia Gómez',
        members: { create: [{ personId: ana, role: 'guardian', relation: 'madre' }, { personId: pablo, role: 'member', relation: 'padre' }, { personId: tomas, role: 'dependent', relation: 'hijo' }] },
      },
    });
  });

  describe('carnet con QR rotativo', () => {
    it('el QR no contiene datos personales y valida mostrando solo nombre y categoría', async () => {
      const card = await creds.memberCard(ana);
      expect(card?.qr?.token).toMatch(/^C1\.[a-z0-9]+\.\d+\.[\w-]{16}$/);
      expect(card!.qr!.token).not.toMatch(/Ana|Gómez|4127/);
      const r = await creds.validate(card!.qr!.token);
      expect(r).toMatchObject({ valid: true, person: { firstName: 'Ana' }, detail: 'Socio N° 4127 · Activo pleno' });
      expect(JSON.stringify(r)).not.toMatch(/deuda|salud|saldo/i);
    });

    it('vence a la ventana siguiente con un margen y no acepta códigos del futuro', async () => {
      const { token } = (await creds.memberCard(ana))!.qr!;
      clock = new Date(clock.getTime() + 35_000);
      expect((await creds.validate(token)).valid).toBe(true);
      clock = new Date(clock.getTime() + 60_000);
      expect(await creds.validate(token)).toMatchObject({ valid: false, reason: 'vencido' });
      const future = qrTokenFor({ id: 'x', secret: 'eA' }, new Date(clock.getTime() + 600_000)).token;
      expect((await creds.validate(future)).valid).toBe(false);
    });

    it('rechaza firmas alteradas, credenciales revocadas y socios sin membresía', async () => {
      const { token } = (await creds.memberCard(ana))!.qr!;
      const forged = token.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
      expect(await creds.validate(forged)).toMatchObject({ valid: false, reason: 'firma' });
      expect(await creds.validate('hola')).toMatchObject({ valid: false, reason: 'formato' });

      const card = await prisma.credential.findFirstOrThrow({ where: { personId: ana } });
      await creds.revoke(card.id, 'Pérdida del teléfono');
      expect(await creds.validate(token)).toMatchObject({ valid: false, reason: 'revocada', person: { firstName: 'Ana' } });

      const t2 = (await creds.memberCard(tomas))!.qr!.token;
      await prisma.clubMembership.updateMany({ where: { personId: tomas }, data: { status: 'suspended' } });
      expect(await creds.validate(t2)).toMatchObject({ valid: false, reason: 'sin_membresia' });
      expect((await creds.memberCard(tomas))!.qr).toBeNull();
    });

    it('quien no es socio no tiene carnet', async () => {
      const card = await creds.memberCard(pablo);
      expect(card?.membership).toBeNull();
      expect(card?.qr).toBeNull();
      expect(await prisma.credential.count({ where: { personId: pablo } })).toBe(0);
    });
  });

  describe('familia', () => {
    it('la responsable administra a su representado, no al otro adulto', async () => {
      expect(await isGuardianOf(prisma, ana, tomas)).toBe(true);
      expect(await isGuardianOf(prisma, ana, pablo)).toBe(false);
      expect(await isGuardianOf(prisma, pablo, tomas)).toBe(false);
      const [g] = await familyView(prisma, ana, new Date('2026-11-16'));
      expect(g!.members.map((m) => [m.firstName, m.manageable])).toEqual([
        ['Ana', true],
        ['Pablo', false],
        ['Tomás', true],
      ]);
      expect(g!.members.find((m) => m.firstName === 'Tomás')).toMatchObject({ age: 12, hasAccount: false, membership: { category: 'Activo pleno' } });
    });
  });

  describe('espacios', () => {
    it('una cuenta, un espacio por participación', async () => {
      await syncBaseRoles(prisma, { coach: ['sports:lineup.edit'], facility_manager: ['facilities:*'], member: [] }, { coach: 'Coach', facility_manager: 'Encargado de instalaciones' });
      await prisma.roleAssignment.createMany({
        data: [
          { personId: ana, roleCode: 'coach', scopeType: 'team', scopeId: 'rugby-m12' },
          { personId: ana, roleCode: 'facility_manager', scopeType: 'club' },
        ],
      });
      const spaces = await spacesFor(prisma, await loadActor(prisma, ana, new Date('2026-11-16')));
      expect(spaces.map((s) => s.label)).toEqual(['Mi club', 'Panel Coach', 'Instalaciones']);
      expect(spaces[1]!.key).toBe('coach:team:rugby-m12');
    });
  });
});
