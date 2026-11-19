/**
 * Administración del padrón: corregir datos de una persona, membresía (alta, estado, categoría) y
 * grupos familiares. Todo queda en la auditoría de la persona, sin documentos en claro: solo qué
 * campos cambiaron y quién lo hizo. La autorización (identity:person.manage) la hace la app.
 */
import { appendOutbox, type Prisma, type PrismaClient } from '@clumera/db';
import { createEvent, DomainError, type Result } from '@clumera/kernel';
import { documentDigest } from './people';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string, details?: Record<string, unknown>) => ({ ok: false, error: new DomainError(code, message, details) }) as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MEMBERSHIP_STATUSES = ['active', 'suspended', 'inactive', 'resigned'] as const;
export type MembershipStatusName = (typeof MEMBERSHIP_STATUSES)[number];
export const FAMILY_ROLES = ['guardian', 'member', 'dependent'] as const;
export type FamilyRoleName = (typeof FAMILY_ROLES)[number];

const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ───────────── Datos de la persona ─────────────

export interface PersonUpdate {
  firstName?: string;
  lastName?: string;
  /** Reemplaza el documento (se guarda como digest + últimos 4). Vacío: no se toca. */
  document?: string | null;
  birthDate?: Date | null;
  email?: string | null;
  phone?: string | null;
}

/** Corrige datos de una persona. Devuelve los campos que cambiaron (nunca sus valores). */
export async function updatePerson(db: PrismaClient, actorPersonId: string, personId: string, input: PersonUpdate, pepper: string | undefined, at = new Date()): Promise<Result<{ changed: string[] }>> {
  const p = await db.person.findUnique({ where: { id: personId }, select: { firstName: true, lastName: true, docDigest: true, birthDate: true, email: true, phone: true } });
  if (!p) return fail('not_found', 'Persona inexistente');
  const data: Prisma.PersonUpdateInput = {};
  const changed: string[] = [];
  const set = (field: keyof PersonUpdate, value: unknown, current: unknown) => {
    const a = value instanceof Date ? value.getTime() : value;
    const b = current instanceof Date ? current.getTime() : current;
    if (a !== b) {
      (data as Record<string, unknown>)[field] = value;
      changed.push(field);
    }
  };
  if (input.firstName !== undefined) {
    const v = input.firstName.trim();
    if (!v) return fail('invalid_input', 'El nombre es obligatorio');
    set('firstName', v, p.firstName);
  }
  if (input.lastName !== undefined) {
    const v = input.lastName.trim();
    if (!v) return fail('invalid_input', 'El apellido es obligatorio');
    set('lastName', v, p.lastName);
  }
  if (input.email !== undefined) {
    const v = input.email?.trim().toLowerCase() || null;
    if (v && !EMAIL.test(v)) return fail('invalid_input', 'Email inválido');
    set('email', v, p.email);
  }
  if (input.phone !== undefined) set('phone', input.phone?.trim() || null, p.phone);
  if (input.birthDate !== undefined) {
    if (input.birthDate && (Number.isNaN(input.birthDate.getTime()) || input.birthDate > at)) return fail('invalid_input', 'La fecha de nacimiento no puede ser futura');
    set('birthDate', input.birthDate ? dayOf(input.birthDate) : null, p.birthDate);
  }
  if (input.document?.trim()) {
    if (!pepper) return fail('invalid_input', 'Esta instalación no tiene configurada la clave de documentos');
    let doc: { docDigest: string; docLast4: string };
    try {
      doc = documentDigest(input.document, pepper);
    } catch {
      return fail('invalid_input', 'Documento inválido');
    }
    if (doc.docDigest !== p.docDigest) {
      const other = await db.person.findUnique({ where: { docDigest: doc.docDigest }, select: { id: true } });
      if (other) return fail('conflict', 'Ya hay otra persona con ese documento', { personId: other.id });
      data.docDigest = doc.docDigest;
      data.docLast4 = doc.docLast4;
      changed.push('document');
    }
  }
  if (!changed.length) return { ok: true, value: { changed } };
  await db.$transaction(async (tx) => {
    await tx.person.update({ where: { id: personId }, data });
    await tx.auditLog.create({ data: { actorPersonId, action: 'person.updated', entityType: 'person', entityId: personId, diff: { fields: changed } } });
    await appendOutbox(tx, createEvent('person.updated', 'identity', { personId, fields: changed }));
  });
  return { ok: true, value: { changed } };
}

// ───────────── Membresía ─────────────

async function nextMemberNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ n: number | null }>>`SELECT max(("memberNumber")::int) AS n FROM "ClubMembership" WHERE "memberNumber" ~ '^[0-9]{1,9}$'`;
  return String((rows[0]?.n ?? 0) + 1);
}

/** Alta de membresía para alguien que no es socio (o lo fue): nueva fila, el historial queda. */
export async function addMembership(
  db: PrismaClient,
  actorPersonId: string,
  personId: string,
  input: { categoryCode: string; memberNumber?: string | null; validFrom?: Date },
  at = new Date(),
): Promise<Result<{ id: string; memberNumber: string }>> {
  const person = await db.person.findUnique({ where: { id: personId }, select: { id: true, memberships: { where: { status: { in: ['active', 'suspended'] } }, select: { id: true } } } });
  if (!person) return fail('not_found', 'Persona inexistente');
  if (person.memberships.length) return fail('conflict', 'Ya tiene una membresía vigente o suspendida: cambiá su estado');
  const category = await db.membershipCategory.findUnique({ where: { code: input.categoryCode } });
  if (!category?.active) return fail('invalid_input', 'Categoría inexistente');
  const wanted = input.memberNumber?.trim() || null;
  if (wanted && !/^\d{1,9}$/.test(wanted)) return fail('invalid_input', 'El N° de socio son solo números');
  if (wanted && (await db.clubMembership.findUnique({ where: { memberNumber: wanted } }))) return fail('conflict', 'Ese N° de socio ya está usado');
  return db.$transaction(async (tx) => {
    const memberNumber = wanted ?? (await nextMemberNumber(tx));
    const m = await tx.clubMembership.create({ data: { personId, categoryId: category.id, memberNumber, validFrom: dayOf(input.validFrom ?? at) } });
    await tx.membershipStatusChange.create({ data: { membershipId: m.id, toStatus: 'active', reason: 'Alta', changedById: actorPersonId } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'membership.created', entityType: 'person', entityId: personId, diff: { membership: { category: category.name, memberNumber } } } });
    await appendOutbox(tx, createEvent('membership.changed', 'identity', { personId, status: 'active' }));
    return { ok: true as const, value: { id: m.id, memberNumber } };
  });
}

/**
 * Cambio de estado (suspender, dar de baja, reactivar) con motivo. Baja o inactiva cierra la vigencia
 * hoy; reactivar la reabre. El carnet deja de habilitar al instante (se valida la membresía vigente).
 */
export async function changeMembershipStatus(
  db: PrismaClient,
  actorPersonId: string,
  membershipId: string,
  input: { status: MembershipStatusName; reason: string },
  at = new Date(),
): Promise<Result<{ status: MembershipStatusName }>> {
  if (!MEMBERSHIP_STATUSES.includes(input.status)) return fail('invalid_input', 'Estado inválido');
  const reason = input.reason.trim().slice(0, 200);
  if (reason.length < 3) return fail('invalid_input', 'Indicá el motivo');
  const m = await db.clubMembership.findUnique({ where: { id: membershipId }, select: { id: true, personId: true, status: true } });
  if (!m) return fail('not_found', 'Membresía inexistente');
  if (m.status === input.status) return fail('invalid_input', 'La membresía ya está en ese estado');
  const closes = input.status === 'inactive' || input.status === 'resigned';
  await db.$transaction(async (tx) => {
    await tx.clubMembership.update({ where: { id: m.id }, data: { status: input.status, validTo: closes ? dayOf(at) : input.status === 'active' ? null : undefined } });
    await tx.membershipStatusChange.create({ data: { membershipId: m.id, fromStatus: m.status, toStatus: input.status, reason, changedById: actorPersonId } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'membership.status_changed', entityType: 'person', entityId: m.personId, diff: { from: m.status, to: input.status, reason } } });
    await appendOutbox(tx, createEvent('membership.changed', 'identity', { personId: m.personId, status: input.status }));
  });
  return { ok: true, value: { status: input.status } };
}

/** Cambio de categoría (por ejemplo, de Menor a Activo al cumplir la edad). */
export async function changeMembershipCategory(db: PrismaClient, actorPersonId: string, membershipId: string, input: { categoryCode: string; reason: string }): Promise<Result<{ category: string }>> {
  const reason = input.reason.trim().slice(0, 200);
  if (reason.length < 3) return fail('invalid_input', 'Indicá el motivo');
  const m = await db.clubMembership.findUnique({ where: { id: membershipId }, include: { category: true } });
  if (!m) return fail('not_found', 'Membresía inexistente');
  const category = await db.membershipCategory.findUnique({ where: { code: input.categoryCode } });
  if (!category?.active) return fail('invalid_input', 'Categoría inexistente');
  if (category.id === m.categoryId) return fail('invalid_input', 'Ya tiene esa categoría');
  await db.$transaction(async (tx) => {
    await tx.clubMembership.update({ where: { id: m.id }, data: { categoryId: category.id } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'membership.category_changed', entityType: 'person', entityId: m.personId, diff: { from: m.category.name, to: category.name, reason } } });
  });
  return { ok: true, value: { category: category.name } };
}

// ───────────── Familias ─────────────

export interface FamilyMemberInput {
  personId: string;
  role: FamilyRoleName;
  relation?: string | null;
}

/** Un grupo con dependientes necesita al menos un responsable. */
function checkGuardians(members: Array<{ role: string }>): string | null {
  return members.some((m) => m.role === 'dependent') && !members.some((m) => m.role === 'guardian') ? 'Un grupo con personas a cargo necesita al menos un responsable' : null;
}

async function auditFamily(tx: Prisma.TransactionClient, actorPersonId: string, action: string, personIds: string[], diff: Record<string, unknown>) {
  await tx.auditLog.createMany({ data: personIds.map((id) => ({ actorPersonId, action, entityType: 'person', entityId: id, diff: diff as Prisma.InputJsonValue })) });
}

/** Grupo familiar nuevo con sus integrantes (responsables, integrantes y a cargo). */
export async function createFamilyGroup(db: PrismaClient, actorPersonId: string, input: { name: string; members: FamilyMemberInput[] }): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) return fail('invalid_input', 'Poné un nombre al grupo (por ejemplo, «Familia Gómez»)');
  const ids = input.members.map((m) => m.personId);
  if (!ids.length) return fail('invalid_input', 'Sumá al menos una persona');
  if (new Set(ids).size !== ids.length) return fail('invalid_input', 'Hay personas repetidas');
  if (input.members.some((m) => !FAMILY_ROLES.includes(m.role))) return fail('invalid_input', 'Rol familiar inválido');
  const problem = checkGuardians(input.members);
  if (problem) return fail('invalid_input', problem);
  if ((await db.person.count({ where: { id: { in: ids } } })) !== ids.length) return fail('not_found', 'Alguna persona no existe');
  const g = await db.$transaction(async (tx) => {
    const group = await tx.familyGroup.create({ data: { name, members: { create: input.members.map((m) => ({ personId: m.personId, role: m.role, relation: m.relation?.trim().slice(0, 40) || null })) } } });
    await auditFamily(tx, actorPersonId, 'family.joined', ids, { group: name });
    await appendOutbox(tx, createEvent('family.changed', 'identity', { groupId: group.id }));
    return group;
  });
  return { ok: true, value: { id: g.id } };
}

export async function addFamilyMember(db: PrismaClient, actorPersonId: string, groupId: string, input: FamilyMemberInput): Promise<Result<{ id: string }>> {
  if (!FAMILY_ROLES.includes(input.role)) return fail('invalid_input', 'Rol familiar inválido');
  const g = await db.familyGroup.findUnique({ where: { id: groupId }, include: { members: { select: { personId: true, role: true } } } });
  if (!g) return fail('not_found', 'Grupo inexistente');
  if (g.members.some((m) => m.personId === input.personId)) return fail('conflict', 'Ya forma parte del grupo');
  if (!(await db.person.findUnique({ where: { id: input.personId }, select: { id: true } }))) return fail('not_found', 'Persona inexistente');
  const problem = checkGuardians([...g.members, { role: input.role }]);
  if (problem) return fail('invalid_input', problem);
  const r = await db.$transaction(async (tx) => {
    const link = await tx.familyRelationship.create({ data: { groupId, personId: input.personId, role: input.role, relation: input.relation?.trim().slice(0, 40) || null } });
    await auditFamily(tx, actorPersonId, 'family.joined', [input.personId], { group: g.name, role: input.role });
    await appendOutbox(tx, createEvent('family.changed', 'identity', { groupId }));
    return link;
  });
  return { ok: true, value: { id: r.id } };
}

/** Quita a alguien del grupo. Si el grupo queda vacío, se elimina. */
export async function removeFamilyMember(db: PrismaClient, actorPersonId: string, groupId: string, personId: string): Promise<Result<{ groupDeleted: boolean }>> {
  const g = await db.familyGroup.findUnique({ where: { id: groupId }, include: { members: { select: { personId: true, role: true } } } });
  if (!g) return fail('not_found', 'Grupo inexistente');
  if (!g.members.some((m) => m.personId === personId)) return fail('not_found', 'No forma parte del grupo');
  const rest = g.members.filter((m) => m.personId !== personId);
  const problem = checkGuardians(rest);
  if (problem) return fail('conflict', `${problem}: sumá otro responsable antes de quitar a este`);
  await db.$transaction(async (tx) => {
    if (rest.length) await tx.familyRelationship.delete({ where: { groupId_personId: { groupId, personId } } });
    else await tx.familyGroup.delete({ where: { id: groupId } });
    await auditFamily(tx, actorPersonId, 'family.left', [personId], { group: g.name });
    await appendOutbox(tx, createEvent('family.changed', 'identity', { groupId }));
  });
  return { ok: true, value: { groupDeleted: rest.length === 0 } };
}
