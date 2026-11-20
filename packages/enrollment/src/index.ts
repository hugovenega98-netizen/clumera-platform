/**
 * Inscripciones (servicio compartido): cupo, lista de espera, bajas y asistencia. Lo usan Escuelas,
 * Verano y, más adelante, Torneos y Eventos. No cobra ni avisa: devuelve qué pasó y deja eventos
 * de dominio en el outbox; cada módulo decide el cargo y el aviso.
 *
 * Regla: nunca se confirma por encima del cupo aunque lleguen dos a la vez. Cada operación sobre
 * un grupo toma un bloqueo transaccional por grupo (funciona detrás de pgbouncer).
 */
import type { PrismaClient } from '@clumera/db';
import { appendOutbox } from '@clumera/db';
import { createEvent, DomainError, type Result } from '@clumera/kernel';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;

const lockGroup = (tx: Tx, groupId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`group:${groupId}`}, 0))`;

/** Lugares ocupados: confirmadas y pendientes (de pago o documentación) cuentan para el cupo. */
const SEAT: Array<'confirmed' | 'pending'> = ['confirmed', 'pending'];

/** Edad cumplida en un día dado (aaaa-mm-dd). */
export function ageOn(birthDate: Date, day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const by = birthDate.getUTCFullYear();
  const bm = birthDate.getUTCMonth() + 1;
  const bd = birthDate.getUTCDate();
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export interface EnrollInput {
  groupId: string;
  personId: string;
  actorPersonId: string;
  memberRate: boolean;
  fee: number;
  /** Con lugar: confirmada (escuelas) o pendiente (si falta pago o documentación, p. ej. colonia). */
  onSeat?: 'confirmed' | 'pending';
}

export type EnrollOutcome = { id: string; status: 'confirmed' | 'pending' | 'waitlist'; waitPosition: number | null };

/** Inscribe con cupo: si hay lugar, toma el lugar; si no, pasa a la lista de espera (al final). */
export async function enroll(db: PrismaClient, input: EnrollInput, now = new Date()): Promise<Result<EnrollOutcome>> {
  const group = await db.group.findUnique({ where: { id: input.groupId }, select: { id: true, active: true, capacity: true, program: { select: { status: true, module: true } } } });
  if (!group?.active) return fail('not_found', 'Grupo inexistente');
  if (group.program.status !== 'open') return fail('conflict', 'La inscripción está cerrada');
  return db.$transaction(async (tx) => {
    await lockGroup(tx, group.id);
    const already = await tx.enrollment.findFirst({ where: { groupId: group.id, personId: input.personId, status: { not: 'withdrawn' } }, select: { id: true } });
    if (already) return fail('conflict', 'Ya está inscripto en este grupo');
    const taken = await tx.enrollment.count({ where: { groupId: group.id, status: { in: SEAT } } });
    const seat = taken < group.capacity;
    const waitPosition = seat ? null : (await tx.enrollment.count({ where: { groupId: group.id, status: 'waitlist' } })) + 1;
    const status = seat ? (input.onSeat ?? 'confirmed') : 'waitlist';
    const e = await tx.enrollment.create({
      data: { groupId: group.id, personId: input.personId, status, waitPosition, memberRate: input.memberRate, fee: input.fee, enrolledById: input.actorPersonId, confirmedAt: status === 'confirmed' ? now : null },
    });
    await appendOutbox(tx, createEvent(status === 'waitlist' ? 'enrollment.waitlisted' : status === 'confirmed' ? 'enrollment.confirmed' : 'enrollment.pending', group.program.module, { enrollmentId: e.id, groupId: group.id, personId: input.personId }));
    return { ok: true as const, value: { id: e.id, status, waitPosition } };
  });
}

/**
 * Baja. Si liberaba un lugar, el primero de la lista de espera lo toma (`promoteTo`) y el resto
 * avanza una posición. Devuelve a quién se promovió, para que el módulo cobre y avise.
 */
export async function withdraw(
  db: PrismaClient,
  enrollmentId: string,
  actorPersonId: string,
  reason: string,
  opts: { promoteTo?: 'confirmed' | 'pending' } = {},
  now = new Date(),
): Promise<Result<{ id: string; chargeId: string | null; promoted: { id: string; personId: string; chargeId: string | null } | null }>> {
  const why = reason.trim().slice(0, 200);
  if (why.length < 3) return fail('invalid_input', 'Indicá el motivo de la baja');
  const found = await db.enrollment.findUnique({ where: { id: enrollmentId }, select: { groupId: true, group: { select: { program: { select: { module: true } } } } } });
  if (!found) return fail('not_found', 'Inscripción inexistente');
  return db.$transaction(async (tx) => {
    await lockGroup(tx, found.groupId);
    const e = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
    if (e.status === 'withdrawn') return fail('conflict', 'La inscripción ya está dada de baja');
    const hadSeat = e.status === 'confirmed' || e.status === 'pending';
    await tx.enrollment.update({ where: { id: e.id }, data: { status: 'withdrawn', waitPosition: null, withdrawnAt: now, withdrawReason: why } });
    const module = found.group.program.module;
    await appendOutbox(tx, createEvent('enrollment.withdrawn', module, { enrollmentId: e.id, groupId: e.groupId, personId: e.personId, byPersonId: actorPersonId }));
    let promoted: { id: string; personId: string; chargeId: string | null } | null = null;
    if (hadSeat) {
      const next = await tx.enrollment.findFirst({ where: { groupId: e.groupId, status: 'waitlist' }, orderBy: { waitPosition: 'asc' } });
      if (next) {
        const to = opts.promoteTo ?? 'confirmed';
        await tx.enrollment.update({ where: { id: next.id }, data: { status: to, waitPosition: null, confirmedAt: to === 'confirmed' ? now : null } });
        promoted = { id: next.id, personId: next.personId, chargeId: next.chargeId };
        await appendOutbox(tx, createEvent('enrollment.promoted', module, { enrollmentId: next.id, groupId: e.groupId, personId: next.personId, status: to }));
      }
    }
    // Los que siguen esperando se renumeran sin huecos (1, 2, 3…).
    const waiting = await tx.enrollment.findMany({ where: { groupId: e.groupId, status: 'waitlist' }, orderBy: { waitPosition: 'asc' }, select: { id: true } });
    for (const [i, w] of waiting.entries()) await tx.enrollment.update({ where: { id: w.id }, data: { waitPosition: i + 1 } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'enrollment.withdrawn', entityType: 'person', entityId: e.personId, diff: { enrollmentId: e.id, groupId: e.groupId, reason: why, promoted: promoted?.id ?? null } } });
    return { ok: true as const, value: { id: e.id, chargeId: e.chargeId, promoted } };
  });
}

/** Lugares tomados y en espera por grupo. */
export async function occupancy(db: PrismaClient, groupIds: string[]) {
  const rows = await db.enrollment.groupBy({ by: ['groupId', 'status'], where: { groupId: { in: groupIds }, status: { in: ['confirmed', 'pending', 'waitlist'] } }, _count: true });
  const out = new Map<string, { taken: number; waiting: number }>(groupIds.map((id) => [id, { taken: 0, waiting: 0 }]));
  for (const r of rows) {
    const o = out.get(r.groupId)!;
    if (r.status === 'waitlist') o.waiting += r._count;
    else o.taken += r._count;
  }
  return out;
}

export type Mark = 'present' | 'absent' | 'late';

/** Asistencia del día: solo de inscriptos confirmados del grupo; se puede corregir el mismo día. */
export async function markAttendance(db: PrismaClient, actorPersonId: string, groupId: string, day: string, marks: Array<{ personId: string; mark: Mark }>): Promise<Result<{ saved: number }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail('invalid_input', 'Día inválido');
  if (!marks.length) return fail('invalid_input', 'No hay asistencia para guardar');
  const enrolled = new Set((await db.enrollment.findMany({ where: { groupId, status: 'confirmed' }, select: { personId: true } })).map((e) => e.personId));
  if (marks.some((m) => !enrolled.has(m.personId))) return fail('invalid_input', 'Hay personas que no están inscriptas en el grupo');
  await db.$transaction(
    marks.map((m) =>
      db.attendance.upsert({
        where: { groupId_personId_day: { groupId, personId: m.personId, day } },
        create: { groupId, personId: m.personId, day, mark: m.mark, markedById: actorPersonId },
        update: { mark: m.mark, markedById: actorPersonId, markedAt: new Date() },
      }),
    ),
  );
  return { ok: true, value: { saved: marks.length } };
}
