import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createGroup, createProgram, dueDateFor, eligibility, enrollInSchool, issueMonthlyFees, markAttendance, roster, scheduleLabel, schoolsAdmin, withdrawFromSchool } from '../src';

describe('horario', () => {
  it('arma el texto de los días', () => {
    expect(scheduleLabel(0b0000101, 17 * 60)).toBe('Lun y Mié 17:00');
    expect(scheduleLabel(0b0100000, 9 * 60 + 30)).toBe('Sáb 09:30');
    expect(scheduleLabel(0b0010101, 18 * 60)).toBe('Lun, Mié y Vie 18:00');
  });
  it('la cuota del mes en curso no nace vencida', () => {
    const now = new Date('2026-11-20T15:00:00Z');
    expect(dueDateFor('2026-11', now).toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(dueDateFor('2026-11', new Date('2026-11-01T15:00:00Z')).toISOString().slice(0, 10)).toBe('2026-11-11');
    expect(dueDateFor('2026-12', now).toISOString().slice(0, 10)).toBe('2026-12-10');
  });
});

const url = testDatabaseUrl('schools');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('Escuelas: inscripción con cuota, espera, bajas y asistencia', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};
  const now = new Date('2026-11-20T15:00:00Z');

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Attendance","Enrollment","Group","Program","Person","ClubMembership","MembershipCategory","Charge","OutboxEvent","AuditLog" CASCADE');
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo' } });
    const kid = (firstName: string, birth: string, member: boolean) =>
      prisma.person.create({ data: { firstName, lastName: 'Gómez', birthDate: new Date(birth), ...(member ? { memberships: { create: { categoryId: cat.id, validFrom: new Date('2024-01-01') } } } : {}) } });
    ids.sofia = (await kid('Sofía', '2017-05-01', true)).id; // 9 años
    ids.tomas = (await kid('Tomás', '2019-02-01', true)).id; // 7 años
    ids.ivan = (await kid('Iván', '2016-01-01', false)).id; // 10, no socio
    ids.leo = (await kid('Leo', '2010-01-01', true)).id; // 16
    ids.coord = (await prisma.person.create({ data: { firstName: 'Carla', lastName: 'Coord' } })).id;
    const p = await createProgram(prisma, ids.coord, { slug: 'natacion', name: 'Natación infantil', activity: 'natacion', minAge: 6, maxAge: 12, membersOnly: false, memberFee: 1_500_000, guestFee: 2_000_000 });
    ids.program = p.ok ? p.value.id : '';
    const g = await createGroup(prisma, ids.coord, ids.program, { name: 'Mar y Jue 18', days: 0b0001010, startMinute: 18 * 60, durationMinutes: 60, capacity: 1, place: 'Pileta cubierta', teacherName: 'Juan Acosta' });
    ids.group = g.ok ? g.value.id : '';
  });

  it('valida edad y fecha de nacimiento; cobra tarifa socio o general', async () => {
    const p = (await prisma.program.findUniqueOrThrow({ where: { id: ids.program! } }))!;
    expect(await eligibility(prisma, p, ids.leo!, now)).toMatchObject({ ok: false, reason: 'Es de 6 a 12 años' });
    expect(await eligibility(prisma, p, ids.ivan!, now)).toMatchObject({ ok: true, fee: 2_000_000, member: false });
    await prisma.person.update({ where: { id: ids.tomas! }, data: { birthDate: null } });
    expect(await eligibility(prisma, p, ids.tomas!, now)).toMatchObject({ ok: false, reason: 'Falta la fecha de nacimiento en la ficha' });
    expect(await enrollInSchool(prisma, ids.coord!, { groupId: ids.group!, personId: ids.leo! }, now)).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('con lugar confirma y deja la cuota del mes; sin lugar, espera sin cargo', async () => {
    const a = await enrollInSchool(prisma, ids.sofia!, { groupId: ids.group!, personId: ids.sofia! }, now);
    expect(a).toMatchObject({ ok: true, value: { status: 'confirmed', fee: 1_500_000 } });
    expect(await prisma.charge.findFirstOrThrow({ where: { personId: ids.sofia! } })).toMatchObject({ concept: 'escuela', amount: 1_500_000, period: '2026-11', description: 'Natación infantil · Mar y Jue 18 · noviembre 2026', source: 'schools' });
    const b = await enrollInSchool(prisma, ids.sofia!, { groupId: ids.group!, personId: ids.ivan! }, now);
    expect(b).toMatchObject({ ok: true, value: { status: 'waitlist', waitPosition: 1, chargeId: null } });
    expect(await prisma.charge.count({ where: { personId: ids.ivan! } })).toBe(0);
  });

  it('la baja anula la cuota impaga y el primero en espera queda confirmado con su cuota', async () => {
    const a = await enrollInSchool(prisma, ids.sofia!, { groupId: ids.group!, personId: ids.sofia! }, now);
    await enrollInSchool(prisma, ids.ivan!, { groupId: ids.group!, personId: ids.ivan! }, now);
    expect(await withdrawFromSchool(prisma, ids.sofia!, a.ok ? a.value.id : '', 'No le gustó', now)).toMatchObject({ ok: true, value: { promoted: { personId: ids.ivan } } });
    expect(await prisma.charge.findFirstOrThrow({ where: { personId: ids.sofia! } })).toMatchObject({ status: 'cancelled' });
    expect(await prisma.charge.findFirstOrThrow({ where: { personId: ids.ivan! } })).toMatchObject({ status: 'pending', amount: 2_000_000 });
    const admin = await schoolsAdmin(prisma);
    expect(admin.kpis).toEqual({ confirmed: 1, capacity: 1, waitlist: 0 });
  });

  it('cuotas del mes: una por inscripción confirmada, aunque se emita dos veces', async () => {
    await enrollInSchool(prisma, ids.sofia!, { groupId: ids.group!, personId: ids.sofia! }, now);
    expect(await issueMonthlyFees(prisma, ids.coord!, '2026-12')).toEqual({ ok: true, value: { issued: 1, existing: 0 } });
    expect(await issueMonthlyFees(prisma, ids.coord!, '2026-12')).toEqual({ ok: true, value: { issued: 0, existing: 1 } });
    expect(await prisma.charge.count({ where: { personId: ids.sofia! } })).toBe(2);
  });

  it('asistencia del día con la lista del grupo', async () => {
    await enrollInSchool(prisma, ids.sofia!, { groupId: ids.group!, personId: ids.sofia! }, now);
    await enrollInSchool(prisma, ids.ivan!, { groupId: ids.group!, personId: ids.ivan! }, now);
    expect(await roster(prisma, ids.group!, '2026-11-24')).toMatchObject({ people: [{ firstName: 'Sofía', mark: null }], waiting: 1, saved: false });
    await markAttendance(prisma, ids.coord!, ids.group!, '2026-11-24', [{ personId: ids.sofia!, mark: 'late' }]);
    expect(await roster(prisma, ids.group!, '2026-11-24')).toMatchObject({ people: [{ mark: 'late' }], saved: true });
  });
});
