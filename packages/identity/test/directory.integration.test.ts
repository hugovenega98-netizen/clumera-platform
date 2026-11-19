import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assignRole, documentDigest, institutionalSummary, personProfile, registerPerson, revokeRole, searchPeople, syncBaseRoles } from '../src';

const url = testDatabaseUrl('identity');
const db = url ? createPrismaClient(url) : null;
const PEPPER = 'pimienta-de-prueba-123456';
const AT = new Date('2026-11-16T12:00:00Z');

describe.skipIf(!db)('padrón de personas sobre PostgreSQL', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Person","Credential","ClubMembership","MembershipCategory","MembershipStatusChange","FamilyGroup","FamilyRelationship","Role","RoleAssignment","UserAccount","AuditLog","OutboxEvent" CASCADE',
    );
    await syncBaseRoles(prisma, { superadmin: ['*'], coach: ['sports:view'], member: [] }, { superadmin: 'Superadmin', coach: 'Coach' });
    const activo = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo pleno' } });
    const cadete = await prisma.membershipCategory.create({ data: { code: 'cadete', name: 'Cadete' } });
    const mk = async (key: string, data: Record<string, unknown>) => (ids[key] = (await prisma.person.create({ data: { lastName: 'X', firstName: key, ...data } })).id);
    await mk('Martina', { lastName: 'Gómez', ...documentDigest('30.123.456', PEPPER), memberships: { create: { categoryId: activo.id, memberNumber: '4127', validFrom: new Date('2014-03-01') } }, account: { create: { login: 'martina', status: 'active' } } });
    await mk('Sofía', { lastName: 'Gómez', birthDate: new Date('2017-02-01'), memberships: { create: { categoryId: cadete.id, memberNumber: '4130', validFrom: new Date('2024-01-01') } } });
    await mk('Diego', { lastName: 'Herrera', account: { create: { login: 'diego', status: 'pending' } } });
    await mk('Julieta', { lastName: 'Méndez', memberships: { create: { categoryId: activo.id, memberNumber: '4198', status: 'suspended', validFrom: new Date('2020-01-01') } } });
    await mk('Nueva', { lastName: 'Socia', memberships: { create: { categoryId: activo.id, memberNumber: '4301', validFrom: new Date('2026-11-05') } } });
    await mk('Admin', { lastName: 'Ruiz', roles: { create: { roleCode: 'superadmin', scopeType: 'club' } } });
  });

  it('busca por nombre, N° de socio y documento (sin guardar el número)', async () => {
    expect((await searchPeople(prisma, { q: 'gómez' }, AT)).items.map((p) => p.firstName)).toEqual(['Martina', 'Sofía']);
    expect((await searchPeople(prisma, { q: 'mar góm' }, AT)).items.map((p) => p.firstName)).toEqual(['Martina']);
    expect((await searchPeople(prisma, { q: 'GOMEZ sofia' }, AT)).items.map((p) => p.firstName)).toEqual(['Sofía']);
    expect((await searchPeople(prisma, { q: '100%_' }, AT)).items).toHaveLength(0);
    expect((await searchPeople(prisma, { q: '4130' }, AT)).items.map((p) => p.firstName)).toEqual(['Sofía']);
    expect((await searchPeople(prisma, { q: '30123456', pepper: PEPPER }, AT)).items.map((p) => p.firstName)).toEqual(['Martina']);
    expect((await searchPeople(prisma, { q: '30123456' }, AT)).items).toHaveLength(0);
  });

  it('filtra y cuenta socios, no socios, menores y staff', async () => {
    const r = await searchPeople(prisma, {}, AT);
    expect(r.counts).toEqual({ all: 6, members: 3, non_members: 3, minors: 1, staff: 1 });
    const row = (await searchPeople(prisma, { filter: 'minors' }, AT)).items[0]!;
    expect(row).toMatchObject({ firstName: 'Sofía', age: 9, memberNumber: '4130', category: 'Cadete', membershipStatus: 'active', accountStatus: null });
    expect((await searchPeople(prisma, { filter: 'staff' }, AT)).items[0]).toMatchObject({ firstName: 'Admin', roles: ['Superadmin'] });
  });

  it('asigna y quita roles con ámbito, auditado y con evento de dominio', async () => {
    const admin = { personId: ids.Admin!, isSuperadmin: true };
    expect(await assignRole(prisma, admin, { personId: ids.Martina!, roleCode: 'coach', scopeType: 'team' })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    const r = await assignRole(prisma, admin, { personId: ids.Martina!, roleCode: 'coach', scopeType: 'team', scopeId: 'Rugby-M12' });
    expect(r.ok).toBe(true);
    expect(await assignRole(prisma, admin, { personId: ids.Martina!, roleCode: 'coach', scopeType: 'team', scopeId: 'rugby-m12' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await assignRole(prisma, admin, { personId: ids.Martina!, roleCode: 'member', scopeType: 'club' })).toMatchObject({ ok: false });

    const profile = await personProfile(prisma, ids.Martina!, AT);
    expect(profile!.roles).toMatchObject([{ roleName: 'Coach', scope: 'Equipo · rugby-m12' }]);
    expect(profile!.history[0]).toMatchObject({ action: 'role.assigned', actor: 'Admin Ruiz' });
    expect(await prisma.outboxEvent.count({ where: { type: 'role.assigned' } })).toBe(1);

    expect((await revokeRole(prisma, admin, profile!.roles[0]!.id)).ok).toBe(true);
    expect((await personProfile(prisma, ids.Martina!, AT))!.roles).toHaveLength(0);
    // Reasignar reactiva la misma asignación.
    expect((await assignRole(prisma, admin, { personId: ids.Martina!, roleCode: 'coach', scopeType: 'team', scopeId: 'rugby-m12' })).ok).toBe(true);
    expect(await prisma.roleAssignment.count({ where: { personId: ids.Martina! } })).toBe(1);
  });

  it('superadmin: solo lo da o lo quita otro superadmin, y nunca el último', async () => {
    const notSuper = { personId: ids.Martina!, isSuperadmin: false };
    expect(await assignRole(prisma, notSuper, { personId: ids.Diego!, roleCode: 'superadmin', scopeType: 'club' })).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    const only = await prisma.roleAssignment.findFirstOrThrow({ where: { roleCode: 'superadmin' } });
    expect(await revokeRole(prisma, { personId: ids.Admin!, isSuperadmin: true }, only.id)).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('la ficha no expone el documento completo ni datos clínicos o de deuda', async () => {
    const p = await personProfile(prisma, ids.Martina!, AT);
    expect(p).toMatchObject({ docLast4: '3456', account: { login: 'martina', status: 'active' }, memberships: [{ number: '4127', category: 'Activo pleno', status: 'active' }] });
    expect(JSON.stringify(p)).not.toMatch(/30123456|docDigest|salud|deuda|saldo/i);
  });

  it('resumen institucional del mes', async () => {
    expect(await institutionalSummary(prisma, AT)).toMatchObject({
      activeMembers: 3,
      newThisMonth: 1,
      suspended: 1,
      people: 6,
      pendingAccounts: 1,
      staff: 1,
      byCategory: [
        { name: 'Activo pleno', count: 2 },
        { name: 'Cadete', count: 1 },
      ],
    });
  });

  it('alta de persona: sin duplicar documentos, con N° de socio siguiente y auditada', async () => {
    const r = await registerPerson(prisma, ids.Admin!, { firstName: ' Lía ', lastName: 'Paz', document: '40.111.222', membership: { categoryCode: 'cadete' } }, PEPPER, AT);
    expect(r).toMatchObject({ ok: true, value: { memberNumber: '4302' } });
    const dup = await registerPerson(prisma, ids.Admin!, { firstName: 'Otra', lastName: 'Paz', document: '40111222' }, PEPPER, AT);
    expect(dup).toMatchObject({ ok: false, error: { code: 'conflict', details: { personId: r.ok ? r.value.id : '' } } });
    expect(await registerPerson(prisma, ids.Admin!, { firstName: 'A', lastName: 'B', membership: { categoryCode: 'activo', memberNumber: '4127' } }, PEPPER, AT)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await registerPerson(prisma, ids.Admin!, { firstName: 'A', lastName: 'B', document: '40111223' }, undefined, AT)).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    const p = await personProfile(prisma, r.ok ? r.value.id : '', AT);
    expect(p).toMatchObject({ firstName: 'Lía', docLast4: '1222', memberships: [{ category: 'Cadete', status: 'active', history: [{ to: 'active', reason: 'Alta' }] }], history: [{ action: 'person.created' }] });
    expect(await prisma.outboxEvent.count({ where: { type: 'person.created' } })).toBe(1);
  });
});
