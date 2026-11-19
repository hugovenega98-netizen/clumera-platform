/**
 * Salud deportiva, portada del core anterior. Tres miradas, nunca mezcladas:
 * - La persona (o su responsable): su reporte, el estado, la disponibilidad y la nota pública.
 * - Médico/Kine (sports:health.view asignado por su nombre, en el ámbito del deporte): todo,
 *   incluida la nota privada y el historial inmutable de evaluaciones.
 * - Coach: solo la disponibilidad deportiva, sin diagnóstico ni notas.
 * Los eventos y avisos nunca llevan datos clínicos.
 */
import { appendOutbox, type PrismaClient } from '@clumera/db';
import { createEvent, DomainError, type Result } from '@clumera/kernel';
import type { MedicalAvailability } from './logic';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;

export const INJURY_STATUSES = ['evaluation', 'follow_up', 'closed'] as const;
export const AVAILABILITIES = ['under_review', 'no_restrictions', 'restricted', 'unavailable'] as const;
export type InjuryStatusName = (typeof INJURY_STATUSES)[number];
export type AvailabilityName = (typeof AVAILABILITIES)[number];

export interface InjuryInput {
  personId: string;
  teamId: string;
  zone: string;
  pain: number;
  context: string;
  impact: string;
  onsetDate: Date;
  notes?: string;
}

const clean = (s: string | undefined, max: number) => (s ?? '').trim().slice(0, max);

/** La persona (o su responsable) informa una molestia o lesión en uno de sus equipos. */
export async function reportInjury(db: PrismaClient, actorPersonId: string, input: InjuryInput, today = new Date()): Promise<Result<{ id: string }>> {
  const zone = clean(input.zone, 80);
  const context = clean(input.context, 80);
  const impact = clean(input.impact, 80);
  if (!zone || !context || !impact || !Number.isInteger(input.pain) || input.pain < 0 || input.pain > 10) return fail('invalid_input', 'Completá zona, dolor (0 a 10), contexto y limitación');
  if (Number.isNaN(input.onsetDate.getTime()) || input.onsetDate > today) return fail('invalid_input', 'La fecha de inicio no puede ser futura');
  const member = await db.teamMember.findUnique({ where: { teamId_personId: { teamId: input.teamId, personId: input.personId } } });
  if (!member?.active) return fail('forbidden', 'Solo se informan lesiones en los equipos propios');
  const r = await db.$transaction(async (tx) => {
    const report = await tx.injuryReport.create({
      data: { personId: input.personId, teamId: input.teamId, zone, pain: input.pain, context, impact, onsetDate: input.onsetDate, notes: clean(input.notes, 2000), createdById: actorPersonId },
    });
    // Sin datos clínicos en el evento: solo a quién avisar.
    await appendOutbox(tx, createEvent('injury.reported', 'sports', { reportId: report.id, teamId: input.teamId }));
    return report;
  });
  return { ok: true, value: { id: r.id } };
}

/** Lo que ve la persona: sus reportes con estado, disponibilidad, nota pública e historial público. */
export async function myInjuries(db: PrismaClient, personIds: string[]) {
  const rows = await db.injuryReport.findMany({
    where: { personId: { in: personIds } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      team: { include: { sport: true } },
      person: { select: { firstName: true } },
      case: { select: { status: true, availability: true, publicNote: true, updatedAt: true } },
      sessions: { orderBy: { createdAt: 'desc' }, select: { id: true, createdAt: true, authorName: true, status: true, availability: true, publicNote: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    personId: r.personId,
    personName: r.person.firstName,
    team: `${r.team.sport.name} · ${r.team.name}`,
    zone: r.zone,
    pain: r.pain,
    context: r.context,
    impact: r.impact,
    onsetDate: r.onsetDate,
    notes: r.notes,
    createdAt: r.createdAt,
    status: r.case?.status ?? 'evaluation',
    availability: (r.case?.availability ?? 'under_review') as AvailabilityName,
    publicNote: r.case?.publicNote ?? '',
    sessions: r.sessions,
  }));
}

/** Bandeja clínica de Médico/Kine para los equipos de su ámbito, con nota privada. */
export async function medicalQueue(db: PrismaClient, teamIds: string[]) {
  if (!teamIds.length) return [];
  const rows = await db.injuryReport.findMany({
    where: { teamId: { in: teamIds } },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: { team: { include: { sport: true } }, person: { select: { firstName: true, lastName: true } }, case: true, _count: { select: { sessions: true } } },
  });
  const open = (s: string | undefined) => s !== 'closed';
  return rows
    .map((r) => ({
      id: r.id,
      personName: `${r.person.firstName} ${r.person.lastName}`,
      team: `${r.team.sport.name} · ${r.team.name}`,
      teamId: r.teamId,
      zone: r.zone,
      pain: r.pain,
      context: r.context,
      impact: r.impact,
      onsetDate: r.onsetDate,
      notes: r.notes,
      createdAt: r.createdAt,
      status: r.case?.status ?? 'evaluation',
      availability: (r.case?.availability ?? 'under_review') as AvailabilityName,
      publicNote: r.case?.publicNote ?? '',
      privateNote: r.case?.privateNote ?? '',
      evaluations: r._count.sessions,
    }))
    .sort((a, b) => Number(open(b.status)) - Number(open(a.status)) || b.createdAt.getTime() - a.createdAt.getTime());
}

/** Historial de evaluaciones. `clinical` agrega la nota privada (solo Médico/Kine). */
export async function injuryHistory(db: PrismaClient, reportId: string, clinical: boolean) {
  return db.injurySession.findMany({
    where: { reportId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, createdAt: true, authorName: true, status: true, availability: true, publicNote: true, privateNote: clinical },
  });
}

export interface EvaluationInput {
  status: InjuryStatusName;
  availability: AvailabilityName;
  publicNote?: string;
  privateNote?: string;
}

/**
 * Evaluación de Médico/Kine: actualiza el estado vigente y agrega una sesión inmutable al historial,
 * en la misma transacción. Un seguimiento finalizado no admite más evaluaciones.
 */
export async function recordEvaluation(db: PrismaClient, author: { personId: string; name: string }, reportId: string, input: EvaluationInput): Promise<Result<{ sessionId: string }>> {
  if (!INJURY_STATUSES.includes(input.status) || !AVAILABILITIES.includes(input.availability)) return fail('invalid_input', 'Estado o disponibilidad inválidos');
  const report = await db.injuryReport.findUnique({ where: { id: reportId }, select: { id: true, personId: true, teamId: true } });
  if (!report) return fail('not_found', 'Reporte inexistente');
  const publicNote = clean(input.publicNote, 2000);
  const privateNote = clean(input.privateNote, 2000);
  try {
    const session = await db.$transaction(
      async (tx) => {
        const current = await tx.injuryCase.findUnique({ where: { reportId }, select: { status: true } });
        if (current?.status === 'closed') throw new DomainError('conflict', 'El seguimiento está finalizado y no admite nuevas evaluaciones');
        const data = { status: input.status, availability: input.availability, publicNote, privateNote, updatedById: author.personId };
        await tx.injuryCase.upsert({ where: { reportId }, create: { reportId, ...data }, update: data });
        const s = await tx.injurySession.create({ data: { reportId, authorId: author.personId, authorName: author.name, status: input.status, availability: input.availability, publicNote, privateNote } });
        await appendOutbox(tx, createEvent('injury.evaluated', 'sports', { reportId, personId: report.personId }));
        return s;
      },
      { isolationLevel: 'Serializable' },
    );
    return { ok: true, value: { sessionId: session.id } };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e };
    throw e;
  }
}

/**
 * Disponibilidad deportiva por persona en un equipo: la del seguimiento más reciente (sin
 * evaluar aún: «pendiente de evaluación»). Nunca devuelve diagnóstico ni notas.
 */
export async function medicalAvailability(db: PrismaClient, teamId: string, personIds: string[]): Promise<Map<string, MedicalAvailability>> {
  if (!personIds.length) return new Map();
  const reports = await db.injuryReport.findMany({
    where: { teamId, personId: { in: personIds } },
    orderBy: { createdAt: 'desc' },
    select: { personId: true, createdAt: true, case: { select: { availability: true, updatedAt: true } } },
  });
  const latest = new Map<string, { at: number; availability: MedicalAvailability }>();
  for (const r of reports) {
    const at = (r.case?.updatedAt ?? r.createdAt).getTime();
    const prev = latest.get(r.personId);
    if (!prev || at > prev.at) latest.set(r.personId, { at, availability: (r.case?.availability ?? 'under_review') as MedicalAvailability });
  }
  return new Map([...latest].map(([k, v]) => [k, v.availability]));
}
