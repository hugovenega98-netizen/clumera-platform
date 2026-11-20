/**
 * Accesos (lienzo «Recepción · control de acceso»): Recepción valida un QR —carnet social, pase o
 * credencial de una reserva— o busca a la persona, en un punto de acceso. Cada intento queda
 * registrado. Recepción ve validez, motivo y el nombre; nunca deuda ni salud.
 *
 * Un rechazo se puede convertir en «excepción autorizada» con un motivo escrito: queda como un
 * intento aparte, enlazado al rechazo, con quién la autorizó.
 */
import type { PrismaClient } from '@clumera/db';
import { appendOutbox } from '@clumera/db';
import type { CredentialService, ValidationResult } from '@clumera/identity';
import { createEvent, DomainError, type Result } from '@clumera/kernel';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;

/** Lo que recibe Recepción: sin ids internos, sin deuda, sin salud. */
export interface CheckView {
  attemptId: string;
  granted: boolean;
  /** Motivo de rechazo (código) o null. */
  reason: string | null;
  /** «Socio N° 1042 · Activo», «Credencial revocada», «Reserva F5-1 · vie 20/11 21:00». */
  detail: string;
  person: { firstName: string; lastName: string } | null;
  /** Se puede autorizar una excepción (rechazo de una persona identificada). */
  canOverride: boolean;
}

export async function listAccessPoints(db: PrismaClient) {
  return db.accessPoint.findMany({ where: { active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, slug: true, name: true } });
}

/** Registra el intento (y su evento de dominio) en una sola transacción. */
async function record(db: PrismaClient, pointId: string, actorPersonId: string, method: 'qr' | 'manual', r: ValidationResult): Promise<CheckView> {
  const detail = r.valid ? r.detail : r.message;
  const attempt = await db.$transaction(async (tx) => {
    const a = await tx.accessAttempt.create({
      data: { pointId, credentialId: r.credentialId ?? null, personId: r.personId ?? null, result: r.valid ? 'granted' : 'denied', reason: r.valid ? null : r.reason, detail, method, byPersonId: actorPersonId },
    });
    await appendOutbox(tx, createEvent(r.valid ? 'access.granted' : 'access.denied', 'access', { attemptId: a.id, pointId, personId: r.personId ?? null, reason: r.valid ? null : r.reason }));
    return a;
  });
  return { attemptId: attempt.id, granted: r.valid, reason: r.valid ? null : r.reason, detail, person: r.person ?? null, canOverride: !r.valid && Boolean(r.personId) };
}

/**
 * Valida en un punto de acceso: un QR (`token`) o la persona buscada (`personId`, su carnet social).
 * Siempre registra el intento, también los códigos ajenos o adulterados.
 */
export async function checkAccess(
  db: PrismaClient,
  credentials: CredentialService,
  actorPersonId: string,
  input: { pointId: string; token?: string; personId?: string },
): Promise<Result<CheckView>> {
  const point = await db.accessPoint.findUnique({ where: { id: input.pointId }, select: { id: true, active: true } });
  if (!point?.active) return fail('not_found', 'Punto de acceso inexistente');
  if (!input.token === !input.personId) return fail('invalid_input', 'Escaneá un código o elegí a la persona');
  const r = input.token ? await credentials.validate(input.token) : await credentials.validatePerson(input.personId!);
  return { ok: true, value: await record(db, point.id, actorPersonId, input.token ? 'qr' : 'manual', r) };
}

/** Excepción autorizada sobre un rechazo: queda registrada con motivo, una sola vez por rechazo. */
export async function authorizeException(db: PrismaClient, actorPersonId: string, attemptId: string, reason: string): Promise<Result<CheckView>> {
  const why = reason.trim().replace(/\s+/g, ' ').slice(0, 200);
  if (why.length < 5) return fail('invalid_input', 'Escribí el motivo de la excepción');
  const denied = await db.accessAttempt.findUnique({ where: { id: attemptId }, include: { person: { select: { firstName: true, lastName: true } }, override: { select: { id: true } } } });
  if (!denied) return fail('not_found', 'Intento inexistente');
  if (denied.result !== 'denied' || !denied.personId) return fail('conflict', 'Solo se autoriza una excepción sobre un rechazo de una persona identificada');
  if (denied.override) return fail('conflict', 'Ya se autorizó una excepción para este intento');
  if (Date.now() - denied.createdAt.getTime() > 15 * 60_000) return fail('conflict', 'El intento es de hace más de 15 minutos: validá de nuevo');
  const detail = `Excepción autorizada · ${why}`;
  const a = await db.$transaction(async (tx) => {
    const created = await tx.accessAttempt.create({
      data: { pointId: denied.pointId, credentialId: denied.credentialId, personId: denied.personId, result: 'granted', detail, method: 'excepcion', overrideReason: why, overrideOfId: denied.id, byPersonId: actorPersonId },
    });
    await tx.auditLog.create({ data: { actorPersonId, action: 'access.override', entityType: 'person', entityId: denied.personId!, diff: { attemptId: created.id, deniedReason: denied.reason, reason: why } } });
    await appendOutbox(tx, createEvent('access.granted', 'access', { attemptId: created.id, pointId: denied.pointId, personId: denied.personId, override: true }));
    return created;
  });
  return { ok: true, value: { attemptId: a.id, granted: true, reason: null, detail, person: denied.person, canOverride: false } };
}

const dayStart = (now: Date) => {
  // Medianoche del club (UTC-3, sin horario de verano).
  const club = new Date(now.getTime() - 3 * 3_600_000);
  return new Date(Date.UTC(club.getUTCFullYear(), club.getUTCMonth(), club.getUTCDate()) + 3 * 3_600_000);
};

/** Resumen del puesto: permitidos y rechazados de hoy y los últimos intentos (nombre y detalle). */
export async function pointSummary(db: PrismaClient, pointId: string, now = new Date(), limit = 8) {
  const since = dayStart(now);
  const [granted, denied, recent] = await Promise.all([
    db.accessAttempt.count({ where: { pointId, result: 'granted', createdAt: { gte: since } } }),
    db.accessAttempt.count({ where: { pointId, result: 'denied', createdAt: { gte: since } } }),
    db.accessAttempt.findMany({
      where: { pointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, result: true, detail: true, method: true, createdAt: true, person: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  return {
    granted,
    denied,
    recent: recent.map((a) => ({ id: a.id, granted: a.result === 'granted', at: a.createdAt, text: a.person ? `${a.person.firstName} ${a.person.lastName} · ${a.detail}` : a.detail, override: a.method === 'excepcion' })),
  };
}
