import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { recordPayment } from '@clumera/finance';
import { authorizePickup, pickupsFor, revokePickup } from '@clumera/identity';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { campAdmin, campChecklist, confirmPaidCamp, enrollInCamp, reviewCampDocument, setCampDetails, submitCampDocument, withdrawFromCamp } from '../src';

const url = testDatabaseUrl('summer');
const db = url ? createPrismaClient(url) : null;
const PEPPER = 'pepper-de-prueba-suficientemente-largo';
const pdf = new TextEncoder().encode('%PDF-1.7 documento de prueba');

describe.skipIf(!db)('Colonia: caso C — dos hermanos con documentos, retiro autorizado y pago', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};
  const now = new Date('2026-12-01T15:00:00Z');

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE "EnrollmentDocument","ProgramDocument","FileBlob","FileObject","PickupAuthorization","Attendance","Enrollment","Group","Program","FamilyRelationship","FamilyGroup","Person","ClubMembership","MembershipCategory","Charge","Payment","PaymentAllocation","OutboxEvent","AuditLog" CASCADE',
    );
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo' } });
    const mk = (firstName: string, birth: string | null) => prisma.person.create({ data: { firstName, lastName: 'Gómez', birthDate: birth ? new Date(birth) : null, memberships: { create: { categoryId: cat.id, validFrom: new Date('2024-01-01') } } } });
    ids.mama = (await mk('Martina', null)).id;
    ids.sofia = (await mk('Sofía', '2017-05-01')).id;
    ids.joaquin = (await mk('Joaquín', '2019-09-10')).id;
    await prisma.familyGroup.create({ data: { name: 'Gómez', members: { create: [{ personId: ids.mama, role: 'guardian', relation: 'madre' }, { personId: ids.sofia, role: 'dependent', relation: 'hija' }, { personId: ids.joaquin, role: 'dependent', relation: 'hijo' }] } } });
    const p = await prisma.program.create({
      data: {
        slug: 'colonia',
        module: 'summer',
        name: 'Colonia de verano',
        activity: 'colonia',
        minAge: 4,
        maxAge: 12,
        feeKind: 'once',
        memberFee: 8_000_000,
        guestFee: 10_000_000,
        familyDiscountPercent: 10,
        documents: { create: [{ code: 'apto', label: 'Apto físico', sensitive: true, sortOrder: 0 }, { code: 'salidas', label: 'Autorización de salidas', sortOrder: 1 }] },
        groups: { create: [{ name: 'G3 · mañana', schedule: 'Lun a Vie 09:00', days: 31, startMinute: 540, durationMinutes: 240, capacity: 10 }, { name: 'G2 · mañana', schedule: 'Lun a Vie 09:00', days: 31, startMinute: 540, durationMinutes: 240, capacity: 1 }] },
      },
      include: { groups: true },
    });
    ids.g3 = p.groups.find((g) => g.name.startsWith('G3'))!.id;
    ids.g2 = p.groups.find((g) => g.name.startsWith('G2'))!.id;
  });

  const family = () => [ids.mama!, ids.sofia!, ids.joaquin!];

  it('inscribe a los dos: lugar tomado, cargo emitido y descuento familiar en el segundo', async () => {
    const a = await enrollInCamp(prisma, ids.mama!, { groupId: ids.g3!, personId: ids.sofia!, familyIds: family() }, now);
    const b = await enrollInCamp(prisma, ids.mama!, { groupId: ids.g2!, personId: ids.joaquin!, familyIds: family() }, now);
    expect(a).toMatchObject({ ok: true, value: { status: 'pending', fee: 8_000_000, discount: 0 } });
    expect(b).toMatchObject({ ok: true, value: { status: 'pending', fee: 7_200_000, discount: 10 } });
    expect(await prisma.charge.count({ where: { source: 'summer', concept: 'colonia', status: 'pending' } })).toBe(2);
    // La mamá es adulta: no entra en la colonia.
    expect(await enrollInCamp(prisma, ids.mama!, { groupId: ids.g3!, personId: ids.mama!, familyIds: family() }, now)).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('se confirma solo con todos los documentos aprobados y el pago acreditado (en cualquier orden)', async () => {
    const a = await enrollInCamp(prisma, ids.mama!, { groupId: ids.g3!, personId: ids.sofia!, familyIds: family() }, now);
    const id = a.ok ? a.value.id : '';
    for (const code of ['apto', 'salidas']) expect(await submitCampDocument(prisma, ids.mama!, { enrollmentId: id, code, filename: `${code}.pdf`, bytes: pdf })).toMatchObject({ ok: true });
    // Un tipo no aceptado se rechaza.
    expect(await submitCampDocument(prisma, ids.mama!, { enrollmentId: id, code: 'apto', filename: 'virus.pdf', bytes: new TextEncoder().encode('MZ...') })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    const items = (await campChecklist(prisma, id))!.docs;
    expect(items.map((d) => d.status)).toEqual(['submitted', 'submitted']);
    expect(await prisma.fileObject.findFirstOrThrow({ where: { purpose: 'colonia:apto' } })).toMatchObject({ sensitive: true, contentType: 'application/pdf' });

    // Rechazo con motivo y nueva subida.
    expect(await reviewCampDocument(prisma, ids.mama!, items[1]!.itemId!, { approve: false })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await reviewCampDocument(prisma, ids.mama!, items[1]!.itemId!, { approve: false, note: 'Falta la firma' }, now)).toMatchObject({ ok: true, value: { status: 'rejected' } });
    await submitCampDocument(prisma, ids.mama!, { enrollmentId: id, code: 'salidas', filename: 'salidas-firmada.pdf', bytes: pdf });

    // Aprobados ambos, pero sin pago: sigue pendiente.
    for (const d of (await campChecklist(prisma, id))!.docs) expect(await reviewCampDocument(prisma, ids.mama!, d.itemId!, { approve: true }, now)).toMatchObject({ ok: true, value: { enrollment: 'pending' } });
    // Se acredita el pago: confirmada.
    const charge = (await campChecklist(prisma, id))!.charge!;
    await recordPayment(prisma, ids.mama!, { payerPersonId: ids.mama!, chargeIds: [charge.id], method: 'transfer' });
    expect(await confirmPaidCamp(prisma, [charge.id], now)).toEqual([id]);
    expect(await prisma.enrollment.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'confirmed' });
    expect(await prisma.outboxEvent.count({ where: { type: 'enrollment.confirmed' } })).toBe(1);
  });

  it('pagar primero y aprobar después también confirma', async () => {
    const a = await enrollInCamp(prisma, ids.mama!, { groupId: ids.g3!, personId: ids.sofia!, familyIds: family() }, now);
    const id = a.ok ? a.value.id : '';
    await recordPayment(prisma, ids.mama!, { payerPersonId: ids.mama!, chargeIds: [a.ok ? a.value.chargeId! : ''], method: 'cash' });
    expect(await confirmPaidCamp(prisma, [a.ok ? a.value.chargeId! : ''], now)).toEqual([]);
    for (const code of ['apto', 'salidas']) await submitCampDocument(prisma, ids.mama!, { enrollmentId: id, code, filename: `${code}.pdf`, bytes: pdf });
    const [d1, d2] = (await campChecklist(prisma, id))!.docs;
    expect(await reviewCampDocument(prisma, ids.mama!, d1!.itemId!, { approve: true }, now)).toMatchObject({ ok: true, value: { enrollment: 'pending' } });
    expect(await reviewCampDocument(prisma, ids.mama!, d2!.itemId!, { approve: true }, now)).toMatchObject({ ok: true, value: { enrollment: 'confirmed' } });
  });

  it('retiro autorizado: persona del padrón por documento (digest + últimos 4), sin duplicar, revocable', async () => {
    const r = await authorizePickup(prisma, ids.mama!, { minorId: ids.sofia!, firstName: 'Pablo', lastName: 'Gómez', relation: 'padre', document: '30.123.456', phone: '11 5555 0102' }, PEPPER);
    expect(r).toMatchObject({ ok: true });
    // El mismo documento para el hermano: es la misma persona.
    const r2 = await authorizePickup(prisma, ids.mama!, { minorId: ids.joaquin!, firstName: 'Pablo', lastName: 'Gómez', relation: 'padre', document: '30123456' }, PEPPER);
    expect(r2.ok && r.ok && r2.value.personId === r.value.personId).toBe(true);
    const pablo = await prisma.person.findUniqueOrThrow({ where: { id: r.ok ? r.value.personId : '' } });
    expect(pablo.docLast4).toBe('3456');
    expect(JSON.stringify(pablo)).not.toContain('30123456');
    // La mamá ya es responsable.
    expect(await authorizePickup(prisma, ids.mama!, { minorId: ids.sofia!, firstName: 'Martina', lastName: 'Gómez', relation: 'madre', document: '28999111' }, PEPPER)).toMatchObject({ ok: true });
    const list = (await pickupsFor(prisma, [ids.sofia!])).get(ids.sofia!)!;
    expect(list.map((x) => [x.name, x.holder])).toEqual(expect.arrayContaining([['Martina Gómez', true], ['Pablo Gómez', false]]));
    await revokePickup(prisma, ids.mama!, r.ok ? r.value.id : '');
    expect((await pickupsFor(prisma, [ids.sofia!])).get(ids.sofia!)!.some((x) => x.name === 'Pablo Gómez')).toBe(false);
    expect((await pickupsFor(prisma, [ids.joaquin!])).get(ids.joaquin!)!.some((x) => x.name === 'Pablo Gómez')).toBe(true);
  });

  it('grupo lleno: espera; la baja promueve al siguiente a pendiente con su cargo; detalles y panel', async () => {
    const a = await enrollInCamp(prisma, ids.mama!, { groupId: ids.g2!, personId: ids.joaquin!, familyIds: family() }, now);
    const b = await enrollInCamp(prisma, ids.mama!, { groupId: ids.g2!, personId: ids.sofia!, familyIds: family() }, now);
    expect(b).toMatchObject({ ok: true, value: { status: 'waitlist', chargeId: null } });
    await withdrawFromCamp(prisma, ids.mama!, a.ok ? a.value.id : '', 'Viajan en enero', now);
    const promoted = await prisma.enrollment.findUniqueOrThrow({ where: { id: b.ok ? b.value.id : '' } });
    expect(promoted).toMatchObject({ status: 'pending' });
    expect(promoted.chargeId).toBeTruthy();
    expect(await setCampDetails(prisma, promoted.id, { imageConsent: true, emergencyName: 'Abuela Rosa', emergencyPhone: '11 4444 0000' })).toMatchObject({ ok: true });
    const admin = await campAdmin(prisma);
    expect(admin.kpis).toMatchObject({ confirmed: 0, pendingPayment: 1, waitlist: 0, docsIncomplete: 1 });
  });
});
