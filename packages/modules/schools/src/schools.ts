/**
 * Escuelas (lienzo «Actividades» del socio, «Actividades · escuelas y colonia» de administración y
 * «Profesor · asistencia del grupo»): propuestas con grupos, cupo y lista de espera sobre el servicio
 * de Inscripciones; la cuota mensual va a la cuenta de la persona (Finanzas, concepto «escuela»).
 */
import type { PrismaClient } from '@clumera/db';
import { ageOn, enroll, markAttendance, occupancy, withdraw, type Mark } from '@clumera/enrollment';
import { cancelCharge, issueCharge } from '@clumera/finance';
import { membershipActive } from '@clumera/identity';
import { DomainError, type Result } from '@clumera/kernel';

const MODULE = 'schools';
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;
export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Día y mes del club (UTC-3, sin horario de verano). */
export function clubToday(now = new Date()) {
  const d = new Date(now.getTime() - 3 * 3_600_000);
  const day = d.toISOString().slice(0, 10);
  return { day, period: day.slice(0, 7), weekday: (d.getUTCDay() + 6) % 7 };
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** «Lun y Mié 17:00» a partir de los días (bits) y el horario. */
export function scheduleLabel(days: number, startMinute: number) {
  const names = WEEKDAYS.filter((_, i) => days & (1 << i));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : (names[0] ?? '');
  return `${list} ${hhmm(startMinute)}`;
}

async function isMember(db: PrismaClient, personId: string, now: Date) {
  const m = await db.clubMembership.findFirst({ where: { personId }, orderBy: { validFrom: 'desc' }, select: { status: true, validFrom: true, validTo: true } });
  return membershipActive(m ?? undefined, now);
}

/** Propuestas abiertas de Escuelas con sus grupos, lugares tomados y en espera. */
export async function openPrograms(db: PrismaClient) {
  const programs = await db.program.findMany({ where: { module: MODULE, status: 'open' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { groups: { where: { active: true }, orderBy: [{ startMinute: 'asc' }, { name: 'asc' }] } } });
  const occ = await occupancy(db, programs.flatMap((p) => p.groups.map((g) => g.id)));
  return programs.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, ...occ.get(g.id)!, free: Math.max(0, g.capacity - occ.get(g.id)!.taken) })) }));
}

export async function programBySlug(db: PrismaClient, slug: string) {
  const p = await db.program.findUnique({ where: { slug }, include: { groups: { where: { active: true }, orderBy: [{ startMinute: 'asc' }, { name: 'asc' }] } } });
  if (!p || p.module !== MODULE) return null;
  const occ = await occupancy(db, p.groups.map((g) => g.id));
  return { ...p, groups: p.groups.map((g) => ({ ...g, ...occ.get(g.id)!, free: Math.max(0, g.capacity - occ.get(g.id)!.taken) })) };
}

/** Si una persona puede inscribirse a un programa (edad, socio) y con qué cuota. */
export async function eligibility(db: PrismaClient, program: { minAge: number | null; maxAge: number | null; membersOnly: boolean; memberFee: number; guestFee: number }, personId: string, now = new Date()) {
  const person = await db.person.findUnique({ where: { id: personId }, select: { birthDate: true } });
  const member = await isMember(db, personId, now);
  const fee = member ? program.memberFee : program.guestFee;
  if (program.membersOnly && !member) return { ok: false as const, reason: 'Es solo para socios', fee, member };
  if (program.minAge !== null || program.maxAge !== null) {
    if (!person?.birthDate) return { ok: false as const, reason: 'Falta la fecha de nacimiento en la ficha', fee, member };
    const age = ageOn(person.birthDate, clubToday(now).day);
    if ((program.minAge !== null && age < program.minAge) || (program.maxAge !== null && age > program.maxAge)) return { ok: false as const, reason: `Es de ${program.minAge ?? 0} a ${program.maxAge ?? 99} años`, fee, member };
  }
  return { ok: true as const, reason: null, fee, member };
}

/**
 * Vencimiento de la cuota: el 10 del mes; si la inscripción es del mes en curso y ya pasó (o falta
 * poco), 10 días desde hoy, para que no nazca vencida.
 */
export function dueDateFor(period: string, now = new Date()) {
  const tenth = new Date(`${period}-10T00:00:00Z`);
  const today = clubToday(now);
  if (period !== today.period) return tenth;
  const soon = new Date(Date.parse(`${today.day}T00:00:00Z`) + 10 * 86_400_000);
  return soon > tenth ? soon : tenth;
}

/** Cargo de la cuota de un mes (idempotente por inscripción y período). */
async function chargeMonth(db: PrismaClient, actorPersonId: string, enrollmentId: string, period: string, now = new Date()) {
  const e = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { group: { include: { program: true } } } });
  if (e.fee <= 0) return null;
  const [y, m] = period.split('-').map(Number) as [number, number];
  const c = await issueCharge(db, actorPersonId, {
    personId: e.personId,
    concept: 'escuela',
    groupLabel: e.group.program.name,
    description: `${e.group.program.name} · ${e.group.name} · ${MONTHS[m - 1]} ${y}`,
    period,
    amount: e.fee,
    dueDate: dueDateFor(period, now),
    source: MODULE,
    sourceRef: `${e.id}:${period}`,
  });
  if (!c.ok) return null;
  if (!e.chargeId) await db.enrollment.update({ where: { id: e.id }, data: { chargeId: c.value.id } });
  return c.value.id;
}

/** Inscribe a una persona (ella o su responsable): con lugar confirma y cobra el mes; si no, espera. */
export async function enrollInSchool(db: PrismaClient, actorPersonId: string, input: { groupId: string; personId: string }, now = new Date()) {
  const group = await db.group.findUnique({ where: { id: input.groupId }, include: { program: true } });
  if (!group?.active || group.program.module !== MODULE) return fail('not_found', 'Grupo inexistente');
  const el = await eligibility(db, group.program, input.personId, now);
  if (!el.ok) return fail('conflict', el.reason);
  const r = await enroll(db, { groupId: group.id, personId: input.personId, actorPersonId, memberRate: el.member, fee: el.fee }, now);
  if (!r.ok) return r;
  const chargeId = r.value.status === 'confirmed' ? await chargeMonth(db, actorPersonId, r.value.id, clubToday(now).period, now) : null;
  return { ok: true as const, value: { ...r.value, chargeId, fee: el.fee } };
}

/**
 * Baja (la persona, su responsable o la coordinación). Anula la cuota del mes si no se pagó; si
 * liberó un lugar, el primero en espera queda confirmado y se le cobra el mes.
 */
export async function withdrawFromSchool(db: PrismaClient, actorPersonId: string, enrollmentId: string, reason: string, now = new Date()) {
  const r = await withdraw(db, enrollmentId, actorPersonId, reason, { promoteTo: 'confirmed' }, now);
  if (!r.ok) return r;
  if (r.value.chargeId) {
    const c = await db.charge.findUnique({ where: { id: r.value.chargeId }, select: { status: true, paidAmount: true } });
    if (c?.status === 'pending' && c.paidAmount === 0) await cancelCharge(db, actorPersonId, r.value.chargeId, 'Baja de la escuela');
  }
  if (r.value.promoted) await chargeMonth(db, actorPersonId, r.value.promoted.id, clubToday(now).period, now);
  return r;
}

/** Cuotas del mes de todas las inscripciones confirmadas (coordinación). Idempotente. */
export async function issueMonthlyFees(db: PrismaClient, actorPersonId: string, period: string): Promise<Result<{ issued: number; existing: number }>> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return fail('invalid_input', 'Período inválido (AAAA-MM)');
  const rows = await db.enrollment.findMany({ where: { status: 'confirmed', fee: { gt: 0 }, group: { program: { module: MODULE, feeKind: 'monthly' } } }, select: { id: true } });
  const before = await db.charge.count({ where: { source: MODULE, period } });
  for (const e of rows) await chargeMonth(db, actorPersonId, e.id, period);
  const after = await db.charge.count({ where: { source: MODULE, period } });
  return { ok: true, value: { issued: after - before, existing: before } };
}

/** Inscripciones (vigentes y en espera) de un grupo de personas: la familia. */
export async function familyEnrollments(db: PrismaClient, personIds: string[]) {
  const rows = await db.enrollment.findMany({
    where: { personId: { in: personIds }, status: { not: 'withdrawn' }, group: { program: { module: MODULE } } },
    orderBy: { createdAt: 'asc' },
    include: { person: { select: { id: true, firstName: true, lastName: true } }, group: { include: { program: { select: { name: true, slug: true } } } } },
  });
  return rows;
}

// ───────────── Administración (coordinación) ─────────────

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface ProgramInput {
  slug: string;
  name: string;
  description?: string;
  activity: string;
  minAge?: number | null;
  maxAge?: number | null;
  membersOnly: boolean;
  memberFee: number;
  guestFee: number;
}

export async function createProgram(db: PrismaClient, actorPersonId: string, input: ProgramInput) {
  if (!SLUG.test(input.slug) || !SLUG.test(input.activity)) return fail('invalid_input', 'Usá minúsculas, números y guiones en el identificador');
  if (input.name.trim().length < 3) return fail('invalid_input', 'Escribí el nombre');
  if (!Number.isSafeInteger(input.memberFee) || !Number.isSafeInteger(input.guestFee) || input.memberFee < 0 || input.guestFee < 0) return fail('invalid_input', 'Revisá las cuotas');
  if (input.minAge != null && input.maxAge != null && input.minAge > input.maxAge) return fail('invalid_input', 'La edad mínima supera la máxima');
  if (await db.program.findUnique({ where: { slug: input.slug } })) return fail('conflict', 'Ya existe una propuesta con ese identificador');
  const p = await db.program.create({ data: { ...input, name: input.name.trim(), description: input.description?.trim() || null, minAge: input.minAge ?? null, maxAge: input.maxAge ?? null, module: MODULE } });
  await db.auditLog.create({ data: { actorPersonId, action: 'program.created', entityType: 'program', entityId: p.id, diff: { slug: p.slug } } });
  return { ok: true as const, value: { id: p.id } };
}

export async function createGroup(db: PrismaClient, actorPersonId: string, programId: string, input: { name: string; days: number; startMinute: number; durationMinutes: number; capacity: number; place?: string; teacherName?: string }) {
  const p = await db.program.findUnique({ where: { id: programId } });
  if (!p || p.module !== MODULE) return fail('not_found', 'Propuesta inexistente');
  if (input.name.trim().length < 2) return fail('invalid_input', 'Escribí el nombre del grupo');
  if (!(input.days >= 1 && input.days <= 127)) return fail('invalid_input', 'Elegí al menos un día');
  if (!(input.capacity >= 1 && input.capacity <= 500)) return fail('invalid_input', 'El cupo va de 1 a 500');
  if (!(input.startMinute >= 0 && input.startMinute < 1440 && input.durationMinutes >= 15 && input.durationMinutes <= 720)) return fail('invalid_input', 'Revisá el horario');
  const g = await db.group.create({
    data: { programId, name: input.name.trim(), days: input.days, startMinute: input.startMinute, durationMinutes: input.durationMinutes, capacity: input.capacity, place: input.place?.trim() || null, teacherName: input.teacherName?.trim() || null, schedule: scheduleLabel(input.days, input.startMinute) },
  });
  await db.auditLog.create({ data: { actorPersonId, action: 'group.created', entityType: 'program', entityId: programId, diff: { groupId: g.id, capacity: g.capacity } } });
  return { ok: true as const, value: { id: g.id } };
}

/** Panel de la coordinación: propuestas, grupos con cupo, indicadores e inscripciones recientes. */
export async function schoolsAdmin(db: PrismaClient) {
  const programs = await db.program.findMany({ where: { module: MODULE }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { groups: { orderBy: [{ startMinute: 'asc' }, { name: 'asc' }] } } });
  const groupIds = programs.flatMap((p) => p.groups.map((g) => g.id));
  const occ = await occupancy(db, groupIds);
  const [confirmed, waitlist, recent] = await Promise.all([
    db.enrollment.count({ where: { groupId: { in: groupIds }, status: 'confirmed' } }),
    db.enrollment.count({ where: { groupId: { in: groupIds }, status: 'waitlist' } }),
    db.enrollment.findMany({ where: { groupId: { in: groupIds } }, orderBy: { updatedAt: 'desc' }, take: 8, include: { person: { select: { firstName: true, lastName: true } }, group: { select: { name: true, program: { select: { name: true } } } } } }),
  ]);
  const capacity = programs.reduce((n, p) => n + p.groups.filter((g) => g.active).reduce((a, g) => a + g.capacity, 0), 0);
  return { programs: programs.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, ...occ.get(g.id)! })) })), kpis: { confirmed, capacity, waitlist }, recent };
}

/** Inscriptos de un grupo (coordinación): confirmadas, pendientes y espera, en orden. */
export async function groupEnrollments(db: PrismaClient, groupId: string) {
  return db.enrollment.findMany({
    where: { groupId, status: { not: 'withdrawn' } },
    orderBy: [{ status: 'asc' }, { waitPosition: 'asc' }, { createdAt: 'asc' }],
    include: { person: { select: { id: true, firstName: true, lastName: true } } },
  });
}

// ───────────── Asistencia (profesor) ─────────────

/** Grupos que ve un profesor: los de los programas de sus actividades (o todos, con `null`). */
export async function teacherGroups(db: PrismaClient, activities: string[] | null) {
  return db.group.findMany({
    where: { active: true, program: { module: MODULE, ...(activities ? { activity: { in: activities } } : {}) } },
    orderBy: [{ program: { name: 'asc' } }, { startMinute: 'asc' }],
    include: { program: { select: { name: true, activity: true } } },
  });
}

/** Lista del día: inscriptos confirmados con la marca guardada (si hay). Sin datos de salud. */
export async function roster(db: PrismaClient, groupId: string, day: string) {
  const [enrolled, marks, waiting] = await Promise.all([
    db.enrollment.findMany({ where: { groupId, status: 'confirmed' }, orderBy: [{ person: { lastName: 'asc' } }, { person: { firstName: 'asc' } }], select: { person: { select: { id: true, firstName: true, lastName: true } } } }),
    db.attendance.findMany({ where: { groupId, day }, select: { personId: true, mark: true } }),
    db.enrollment.count({ where: { groupId, status: 'waitlist' } }),
  ]);
  const byPerson = new Map(marks.map((m) => [m.personId, m.mark]));
  return { people: enrolled.map((e) => ({ ...e.person, mark: (byPerson.get(e.person.id) ?? null) as Mark | null })), waiting, saved: marks.length > 0 };
}

export { markAttendance };
