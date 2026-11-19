import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addFamilyMember,
  addMembership,
  applyImport,
  changeMembershipCategory,
  changeMembershipStatus,
  createFamilyGroup,
  documentDigest,
  parseCsv,
  parseDateCell,
  planImport,
  readSpreadsheet,
  removeFamilyMember,
  updatePerson,
} from '../src';

const url = testDatabaseUrl('identity');
const db = url ? createPrismaClient(url) : null;
const PEPPER = 'pepper-de-prueba-para-documentos';

describe('parseo de planillas', () => {
  it('CSV con punto y coma, comillas y BOM', () => {
    expect(parseCsv('\uFEFFNombre;Apellido\n"Ana; María";"Gómez ""Tata"""\r\n\n;\n')).toEqual([
      ['Nombre', 'Apellido'],
      ['Ana; María', 'Gómez "Tata"'],
    ]);
  });
  it('fechas: dd/mm/aaaa, ISO, número de serie de Excel; rechaza el 31/02', () => {
    expect(parseDateCell('07/09/2012')).toEqual(new Date(Date.UTC(2012, 8, 7)));
    expect(parseDateCell('1990-05-04')).toEqual(new Date(Date.UTC(1990, 4, 4)));
    expect(parseDateCell('32997')).toEqual(new Date(Date.UTC(1990, 4, 4)));
    expect(parseDateCell('31/02/2001')).toBe('invalid');
    expect(parseDateCell('')).toBeNull();
  });
  it('lee la primera hoja de un .xlsx real (texto compartido, números y fechas)', () => {
    const rows = readSpreadsheet(new Uint8Array(readFileSync(new URL('./fixtures/padron.xlsx', import.meta.url))), 'padron.xlsx');
    expect(rows[0]).toEqual(['Nombre', 'Apellido', 'DNI', 'Fecha de nacimiento', 'Email', 'Teléfono', 'Categoría', 'N° de socio']);
    expect(rows[1]!.slice(0, 3)).toEqual(['Lucía', 'Pérez', '30111222']);
    expect(parseDateCell(rows[1]![3]!)).toEqual(new Date(Date.UTC(1990, 4, 4)));
    expect(rows[2]![1]).toBe('Ríos & Hijos');
  });
});

describe.skipIf(!db)('administración del padrón', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Person","Credential","ClubMembership","MembershipCategory","MembershipStatusChange","FamilyGroup","FamilyRelationship","AuditLog","OutboxEvent" CASCADE',
    );
    await prisma.membershipCategory.createMany({ data: [{ code: 'activo', name: 'Activo' }, { code: 'menor', name: 'Menor' }] });
    for (const k of ['admin', 'ana', 'tomas', 'pedro']) ids[k] = (await prisma.person.create({ data: { firstName: k, lastName: 'X', ...(k === 'pedro' ? documentDigest('22333444', PEPPER) : {}) } })).id;
  });

  it('corrige datos: solo registra qué campos cambiaron, nunca el documento en claro', async () => {
    expect(await updatePerson(prisma, ids.admin!, ids.ana!, { email: 'no-mail' }, PEPPER)).toMatchObject({ ok: false });
    expect(await updatePerson(prisma, ids.admin!, ids.ana!, { document: '22.333.444' }, PEPPER)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    const r = await updatePerson(prisma, ids.admin!, ids.ana!, { firstName: 'Ana', email: 'ANA@club.com', document: '30.999.888', phone: '' }, PEPPER);
    expect(r).toEqual({ ok: true, value: { changed: ['firstName', 'email', 'document'] } });
    expect(await prisma.person.findUnique({ where: { id: ids.ana! }, select: { email: true, docLast4: true } })).toEqual({ email: 'ana@club.com', docLast4: '9888' });
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: ids.ana! } }));
    expect(audit).toContain('person.updated');
    expect(audit).not.toMatch(/30999888|30\.999/);
    expect(await updatePerson(prisma, ids.admin!, ids.ana!, { firstName: 'Ana' }, PEPPER)).toEqual({ ok: true, value: { changed: [] } });
  });

  it('membresía: alta, suspensión con motivo, baja que cierra la vigencia, reactivación y categoría', async () => {
    const m = await addMembership(prisma, ids.admin!, ids.ana!, { categoryCode: 'activo' });
    const id = m.ok ? m.value.id : '';
    expect(await addMembership(prisma, ids.admin!, ids.ana!, { categoryCode: 'activo' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await changeMembershipStatus(prisma, ids.admin!, id, { status: 'suspended', reason: '' })).toMatchObject({ ok: false });
    expect((await changeMembershipStatus(prisma, ids.admin!, id, { status: 'suspended', reason: 'Falta de pago' })).ok).toBe(true);
    expect((await changeMembershipStatus(prisma, ids.admin!, id, { status: 'resigned', reason: 'Se muda' }, new Date('2026-11-19T15:00:00Z'))).ok).toBe(true);
    expect(await prisma.clubMembership.findUnique({ where: { id }, select: { status: true, validTo: true } })).toEqual({ status: 'resigned', validTo: new Date('2026-11-19T00:00:00Z') });
    expect((await changeMembershipStatus(prisma, ids.admin!, id, { status: 'active', reason: 'Vuelve' })).ok).toBe(true);
    expect((await prisma.clubMembership.findUnique({ where: { id } }))!.validTo).toBeNull();
    expect(await prisma.membershipStatusChange.count({ where: { membershipId: id } })).toBe(4);
    expect(await changeMembershipCategory(prisma, ids.admin!, id, { categoryCode: 'menor', reason: 'Corrección' })).toEqual({ ok: true, value: { category: 'Menor' } });
  });

  it('familias: grupo con responsable obligatorio si hay personas a cargo; quitar al último lo elimina', async () => {
    expect(await createFamilyGroup(prisma, ids.admin!, { name: 'Familia X', members: [{ personId: ids.tomas!, role: 'dependent' }] })).toMatchObject({ ok: false });
    const g = await createFamilyGroup(prisma, ids.admin!, { name: 'Familia X', members: [{ personId: ids.ana!, role: 'guardian', relation: 'madre' }, { personId: ids.tomas!, role: 'dependent', relation: 'hijo' }] });
    const gid = g.ok ? g.value.id : '';
    expect(await addFamilyMember(prisma, ids.admin!, gid, { personId: ids.ana!, role: 'member' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(await removeFamilyMember(prisma, ids.admin!, gid, ids.ana!)).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect((await addFamilyMember(prisma, ids.admin!, gid, { personId: ids.pedro!, role: 'guardian', relation: 'padre' })).ok).toBe(true);
    expect((await removeFamilyMember(prisma, ids.admin!, gid, ids.ana!)).ok).toBe(true);
    await removeFamilyMember(prisma, ids.admin!, gid, ids.tomas!);
    expect(await removeFamilyMember(prisma, ids.admin!, gid, ids.pedro!)).toEqual({ ok: true, value: { groupDeleted: true } });
    expect(await prisma.familyGroup.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: { in: ['family.joined', 'family.left'] } } })).toBe(6);
  });

  it('importación: plan por fila (alta, actualización, errores) y aplicación sin duplicar', async () => {
    await addMembership(prisma, ids.admin!, ids.pedro!, { categoryCode: 'activo', memberNumber: '1500' });
    const table = [
      ['Nombre', 'Apellido', 'DNI', 'Nacimiento', 'Correo', 'Categoría', 'Nro de socio'],
      ['Lucía', 'Pérez', '30111222', '04/05/1990', 'lucia@ejemplo.com', 'Activo', '2001'],
      ['Pedro', 'X', '22.333.444', '', 'pedro@club.com', '', ''],
      ['Otro', 'Socio', '', '', '', '', '1500'],
      ['Sin', '', '', '', '', '', ''],
      ['Lu', 'Repetida', '30111222', '', '', '', ''],
      ['Raro', 'Fecha', '', '31/02/2001', 'no-es-mail', 'Inexistente', ''],
      ['Menor', 'Nuevo', '', '07/09/2012', '', 'menor', ''],
    ];
    const plan = await planImport(prisma, table, PEPPER, new Date('2026-11-19T12:00:00Z'));
    expect(plan.missing).toEqual([]);
    expect(plan.rows.map((r) => [r.line, r.action])).toEqual([
      [2, 'create'],
      [3, 'update'],
      [4, 'error'],
      [5, 'error'],
      [6, 'error'],
      [7, 'error'],
      [8, 'create'],
    ]);
    expect(plan.rows[1]!.fields).toEqual(['firstName', 'email']);
    expect(plan.rows[2]!.messages).toEqual(['Es la misma persona que la fila 3']);
    expect(plan.rows[4]!.messages).toEqual(['Documento repetido (fila 2)']);
    expect(plan.rows[5]!.messages).toEqual(['Fecha de nacimiento inválida (usá dd/mm/aaaa)', 'Email inválido', 'Categoría «Inexistente» inexistente']);
    expect(plan.counts).toEqual({ create: 2, update: 1, unchanged: 0, error: 4 });

    const r = await applyImport(prisma, ids.admin!, plan, new Date('2026-11-19T12:00:00Z'));
    expect(r).toEqual({ created: 2, updated: 1, failed: [] });
    expect(await prisma.clubMembership.findUnique({ where: { memberNumber: '2001' }, select: { person: { select: { firstName: true, docLast4: true } } } })).toEqual({ person: { firstName: 'Lucía', docLast4: '1222' } });
    expect(await prisma.clubMembership.count({ where: { category: { code: 'menor' } } })).toBe(1);
    // Reimportar el mismo archivo: no duplica.
    const again = await planImport(prisma, table, PEPPER, new Date('2026-11-19T12:00:00Z'));
    expect(again.counts).toEqual({ create: 0, update: 0, unchanged: 2, error: 5 });
    expect(again.rows[0]!.action).toBe('unchanged');
    // Sin documento ni N° de socio y con un homónimo en el padrón: se frena en vez de duplicar.
    expect(again.rows[6]!.messages[0]).toMatch(/agregá el documento o el N° de socio/);
  });

  it('sin columnas de nombre y apellido no hay plan', async () => {
    expect((await planImport(prisma, [['DNI'], ['1']], PEPPER)).missing).toEqual(['Nombre', 'Apellido']);
  });
});
