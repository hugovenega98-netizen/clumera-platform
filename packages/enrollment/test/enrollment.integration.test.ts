import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ageOn, enroll, markAttendance, occupancy, withdraw } from '../src';

describe('edad', () => {
  it('cuenta años cumplidos', () => {
    expect(ageOn(new Date('2018-03-15'), '2026-03-14')).toBe(7);
    expect(ageOn(new Date('2018-03-15'), '2026-03-15')).toBe(8);
  });
});

const url = testDatabaseUrl('enrollment');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('Inscripciones: cupo, espera, bajas y asistencia', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};
  const people: string[] = [];

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Attendance","Enrollment","Group","Program","Person","OutboxEvent","AuditLog" CASCADE');
    const p = await prisma.program.create({ data: { slug: 'natacion', module: 'schools', name: 'Natación infantil', activity: 'natacion', memberFee: 100, guestFee: 150 } });
    ids.group = (await prisma.group.create({ data: { programId: p.id, name: 'Mar y Jue 18', schedule: 'Mar y Jue 18:00', days: 0b0001010, startMinute: 1080, durationMinutes: 60, capacity: 2 } })).id;
    ids.program = p.id;
    people.length = 0;
    for (let i = 0; i < 6; i++) people.push((await prisma.person.create({ data: { firstName: `P${i}`, lastName: 'Prueba' } })).id);
  });
  const base = (personId: string) => ({ groupId: ids.group!, personId, actorPersonId: personId, memberRate: true, fee: 100 });

  it('confirma hasta el cupo y después pone en espera, en orden', async () => {
    expect(await enroll(prisma, base(people[0]!))).toMatchObject({ ok: true, value: { status: 'confirmed', waitPosition: null } });
    expect(await enroll(prisma, base(people[1]!))).toMatchObject({ ok: true, value: { status: 'confirmed' } });
    expect(await enroll(prisma, base(people[2]!))).toMatchObject({ ok: true, value: { status: 'waitlist', waitPosition: 1 } });
    expect(await enroll(prisma, base(people[3]!))).toMatchObject({ ok: true, value: { status: 'waitlist', waitPosition: 2 } });
    expect(await enroll(prisma, base(people[0]!))).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect((await occupancy(prisma, [ids.group!])).get(ids.group!)).toEqual({ taken: 2, waiting: 2 });
  });

  it('nunca supera el cupo aunque lleguen todas a la vez', async () => {
    const results = await Promise.all(people.map((p) => enroll(prisma, base(p))));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await prisma.enrollment.count({ where: { status: 'confirmed' } })).toBe(2);
    const waits = (await prisma.enrollment.findMany({ where: { status: 'waitlist' }, orderBy: { waitPosition: 'asc' } })).map((e) => e.waitPosition);
    expect(waits).toEqual([1, 2, 3, 4]);
  });

  it('una baja con lugar promueve al primero de la espera y renumera', async () => {
    const a = await enroll(prisma, base(people[0]!));
    await enroll(prisma, base(people[1]!));
    await enroll(prisma, base(people[2]!));
    await enroll(prisma, base(people[3]!));
    const r = await withdraw(prisma, a.ok ? a.value.id : '', people[0]!, 'Se mudó');
    expect(r).toMatchObject({ ok: true, value: { promoted: { personId: people[2] } } });
    expect(await prisma.enrollment.findFirst({ where: { personId: people[2]! } })).toMatchObject({ status: 'confirmed', waitPosition: null });
    expect(await prisma.enrollment.findFirst({ where: { personId: people[3]! } })).toMatchObject({ status: 'waitlist', waitPosition: 1 });
    expect(await withdraw(prisma, a.ok ? a.value.id : '', people[0]!, 'Se mudó')).toMatchObject({ ok: false, error: { code: 'conflict' } });
    // Puede volver a inscribirse: queda último en la espera.
    expect(await enroll(prisma, base(people[0]!))).toMatchObject({ ok: true, value: { status: 'waitlist', waitPosition: 2 } });
    expect(await prisma.outboxEvent.count({ where: { type: 'enrollment.promoted' } })).toBe(1);
  });

  it('la baja de alguien en espera no promueve a nadie', async () => {
    await enroll(prisma, base(people[0]!));
    await enroll(prisma, base(people[1]!));
    const w = await enroll(prisma, base(people[2]!));
    expect(await withdraw(prisma, w.ok ? w.value.id : '', people[2]!, 'Ya no puede')).toMatchObject({ ok: true, value: { promoted: null } });
  });

  it('con onSeat pending (colonia) el lugar queda tomado aunque falte el pago', async () => {
    expect(await enroll(prisma, { ...base(people[0]!), onSeat: 'pending' })).toMatchObject({ ok: true, value: { status: 'pending' } });
    await enroll(prisma, base(people[1]!));
    expect(await enroll(prisma, base(people[2]!))).toMatchObject({ ok: true, value: { status: 'waitlist' } });
  });

  it('asistencia: solo inscriptos confirmados; se corrige en el día', async () => {
    await enroll(prisma, base(people[0]!));
    await enroll(prisma, base(people[1]!));
    await enroll(prisma, base(people[2]!)); // en espera
    expect(await markAttendance(prisma, people[5]!, ids.group!, '2026-11-24', [{ personId: people[2]!, mark: 'present' }])).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await markAttendance(prisma, people[5]!, ids.group!, '2026-11-24', [{ personId: people[0]!, mark: 'present' }, { personId: people[1]!, mark: 'absent' }])).toEqual({ ok: true, value: { saved: 2 } });
    await markAttendance(prisma, people[5]!, ids.group!, '2026-11-24', [{ personId: people[1]!, mark: 'late' }]);
    expect((await prisma.attendance.findMany({ orderBy: { mark: 'asc' } })).map((a) => a.mark).sort()).toEqual(['late', 'present']);
  });

  it('inscripción cerrada', async () => {
    await prisma.program.update({ where: { id: ids.program! }, data: { status: 'closed' } });
    expect(await enroll(prisma, base(people[0]!))).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });
});
