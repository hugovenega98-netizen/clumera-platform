/**
 * Padrón de personas para la administración: búsqueda, ficha, roles con alcance y el resumen del
 * inicio institucional. Nunca devuelve datos clínicos ni deuda (cada uno vive en su módulo, con su
 * permiso); el documento solo se muestra como últimos 4.
 */
import { appendOutbox, Prisma, type PrismaClient } from '@clumera/db';
import { createEvent, DomainError, type Result } from '@clumera/kernel';
import { documentDigest } from './people';
import { familyView } from './family';

type FamilyGroupView = Awaited<ReturnType<typeof familyView>>[number];

export type PeopleFilter = 'all' | 'members' | 'non_members' | 'minors' | 'staff';

export interface PersonRow {
  id: string;
  firstName: string;
  lastName: string;
  age: number | null;
  memberNumber: string | null;
  category: string | null;
  membershipStatus: 'active' | 'suspended' | 'inactive' | 'resigned' | null;
  accountStatus: 'pending' | 'active' | 'locked' | 'disabled' | null;
  roles: string[];
}

export interface PeoplePage {
  items: PersonRow[];
  total: number;
  page: number;
  pages: number;
  counts: Record<PeopleFilter, number>;
}

const PAGE_SIZE = 25;
const SCOPE_WORD: Record<string, string> = { club: 'Todo el club', sport: 'Deporte', team: 'Equipo', venue: 'Espacio', resource: 'Recurso', event: 'Evento', activity: 'Actividad' };
export const SCOPE_TYPES = ['club', 'sport', 'team', 'venue', 'resource', 'event', 'activity'] as const;
export type ScopeTypeName = (typeof SCOPE_TYPES)[number];

export function ageOn(birthDate: Date | null, at: Date): number | null {
  if (!birthDate) return null;
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = at.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && at.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

export function scopeLabel(scopeType: string, scopeId: string): string {
  return scopeType === 'club' ? SCOPE_WORD.club! : `${SCOPE_WORD[scopeType] ?? scopeType} · ${scopeId}`;
}

function eighteenYearsBefore(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear() - 18, at.getUTCMonth(), at.getUTCDate()));
}

function filterWhere(filter: PeopleFilter, at: Date): Prisma.PersonWhereInput {
  switch (filter) {
    case 'members':
      return { memberships: { some: { status: 'active' } } };
    case 'non_members':
      return { memberships: { none: { status: 'active' } } };
    case 'minors':
      return { birthDate: { gt: eighteenYearsBefore(at) } };
    case 'staff':
      return { roles: { some: { active: true } } };
    default:
      return {};
  }
}

const FROM = 'áàäâéèëêíìïîóòöôúùüûñç';
const TO = 'aaaaeeeeiiiioooouuuunc';
const fold = (s: string) => [...s.toLowerCase()].map((c) => (FROM.includes(c) ? TO[FROM.indexOf(c)]! : c)).join('');

/**
 * Texto de búsqueda: solo dígitos cortos → N° de socio; 7 u 8 dígitos (o más) → documento, por su
 * digest; si no, cada palabra debe aparecer en el nombre, el apellido o el email, sin importar
 * mayúsculas ni acentos («gomez» encuentra a «Gómez»).
 */
async function queryWhere(db: PrismaClient, q: string, pepper: string | undefined): Promise<Prisma.PersonWhereInput> {
  const text = q.trim();
  if (!text) return {};
  const digits = text.replace(/[.\s-]/g, '');
  if (/^\d{1,6}$/.test(digits)) return { memberships: { some: { memberNumber: digits } } };
  if (/^[0-9a-z]{7,}$/i.test(digits) && /\d{5}/.test(digits) && pepper) {
    return { docDigest: documentDigest(digits, pepper).docDigest };
  }
  const words = fold(text)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const haystack = Prisma.sql`translate(lower("firstName" || ' ' || "lastName" || ' ' || coalesce("email", '')), ${FROM}, ${TO})`;
  const rows = await db.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id FROM "Person" WHERE ${Prisma.join(
      words.map((w) => Prisma.sql`${haystack} LIKE ${w}`),
      ' AND ',
    )} LIMIT 5000`,
  );
  return { id: { in: rows.map((r) => r.id) } };
}

export async function searchPeople(
  db: PrismaClient,
  options: { q?: string; filter?: PeopleFilter; page?: number; pepper?: string },
  at = new Date(),
): Promise<PeoplePage> {
  const filter = options.filter ?? 'all';
  const base = await queryWhere(db, options.q ?? '', options.pepper);
  const where: Prisma.PersonWhereInput = { AND: [base, filterWhere(filter, at)] };
  const filters: PeopleFilter[] = ['all', 'members', 'non_members', 'minors', 'staff'];
  const [total, rows, ...countList] = await Promise.all([
    db.person.count({ where }),
    db.person.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      skip: (Math.max(1, options.page ?? 1) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        account: { select: { status: true } },
        memberships: { orderBy: { validFrom: 'desc' }, take: 1, select: { memberNumber: true, status: true, category: { select: { name: true } } } },
        roles: { where: { active: true }, select: { role: { select: { name: true } } } },
      },
    }),
    ...filters.map((f) => db.person.count({ where: { AND: [base, filterWhere(f, at)] } })),
  ]);
  const page = Math.max(1, options.page ?? 1);
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts: Object.fromEntries(filters.map((f, i) => [f, countList[i]!])) as Record<PeopleFilter, number>,
    items: rows.map((p) => {
      const m = p.memberships[0];
      return {
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        age: ageOn(p.birthDate, at),
        memberNumber: m?.memberNumber ?? null,
        category: m?.category.name ?? null,
        membershipStatus: m?.status ?? null,
        accountStatus: p.account?.status ?? null,
        roles: [...new Set(p.roles.map((r) => r.role.name))],
      };
    }),
  };
}

export interface PersonProfile {
  id: string;
  firstName: string;
  lastName: string;
  docLast4: string | null;
  birthDate: Date | null;
  age: number | null;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  memberships: Array<{
    id: string;
    number: string | null;
    category: string;
    categoryCode: string;
    status: 'active' | 'suspended' | 'inactive' | 'resigned';
    validFrom: Date;
    validTo: Date | null;
    history: Array<{ from: string | null; to: string; reason: string | null; at: Date }>;
  }>;
  family: FamilyGroupView[];
  roles: Array<{ id: string; roleCode: string; roleName: string; scopeType: string; scopeId: string; scope: string; since: Date }>;
  account: { login: string; status: 'pending' | 'active' | 'locked' | 'disabled'; lastLoginAt: Date | null; createdAt: Date } | null;
  credentials: Array<{ id: string; kind: string; status: string; validFrom: Date; validTo: Date | null; revokedReason: string | null }>;
  history: Array<{ action: string; at: Date; actor: string | null; diff: unknown }>;
}

export async function personProfile(db: PrismaClient, personId: string, at = new Date()): Promise<PersonProfile | null> {
  const p = await db.person.findUnique({
    where: { id: personId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      docLast4: true,
      birthDate: true,
      email: true,
      phone: true,
      createdAt: true,
      account: { select: { login: true, status: true, lastLoginAt: true, createdAt: true } },
      memberships: {
        orderBy: { validFrom: 'desc' },
        select: {
          id: true,
          memberNumber: true,
          status: true,
          validFrom: true,
          validTo: true,
          category: { select: { name: true, code: true } },
          history: { orderBy: { changedAt: 'desc' }, take: 10, select: { fromStatus: true, toStatus: true, reason: true, changedAt: true } },
        },
      },
      roles: { where: { active: true }, orderBy: { createdAt: 'asc' }, select: { id: true, roleCode: true, scopeType: true, scopeId: true, createdAt: true, role: { select: { name: true } } } },
      credentials: { orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, status: true, validFrom: true, validTo: true, revokedReason: true } },
    },
  });
  if (!p) return null;
  const [family, audit] = await Promise.all([
    familyView(db, personId, at),
    db.auditLog.findMany({ where: { entityType: 'person', entityId: personId }, orderBy: { at: 'desc' }, take: 20 }),
  ]);
  const actorIds = [...new Set(audit.map((a) => a.actorPersonId).filter((x): x is string => Boolean(x)))];
  const actors = new Map((await db.person.findMany({ where: { id: { in: actorIds } }, select: { id: true, firstName: true, lastName: true } })).map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    docLast4: p.docLast4,
    birthDate: p.birthDate,
    age: ageOn(p.birthDate, at),
    email: p.email,
    phone: p.phone,
    createdAt: p.createdAt,
    memberships: p.memberships.map((m) => ({
      id: m.id,
      number: m.memberNumber,
      category: m.category.name,
      categoryCode: m.category.code,
      status: m.status,
      validFrom: m.validFrom,
      validTo: m.validTo,
      history: m.history.map((h) => ({ from: h.fromStatus, to: h.toStatus, reason: h.reason, at: h.changedAt })),
    })),
    family,
    roles: p.roles.map((r) => ({ id: r.id, roleCode: r.roleCode, roleName: r.role.name, scopeType: r.scopeType, scopeId: r.scopeId, scope: scopeLabel(r.scopeType, r.scopeId), since: r.createdAt })),
    account: p.account,
    credentials: p.credentials,
    history: audit.map((a) => ({ action: a.action, at: a.at, actor: a.actorPersonId ? (actors.get(a.actorPersonId) ?? null) : null, diff: a.diff })),
  };
}

export interface RoleAssignmentInput {
  personId: string;
  roleCode: string;
  scopeType: ScopeTypeName;
  scopeId?: string;
}

const SCOPE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * Asigna un rol con su ámbito. `member` no se asigna (sale de la membresía) y `superadmin` solo lo
 * da otro superadmin. Reasignar un rol revocado lo reactiva.
 */
export async function assignRole(
  db: PrismaClient,
  actor: { personId: string; isSuperadmin: boolean },
  input: RoleAssignmentInput,
): Promise<Result<{ id: string }>> {
  const scopeId = input.scopeType === 'club' ? '' : (input.scopeId ?? '').trim().toLowerCase();
  if (input.roleCode === 'member') return { ok: false, error: new DomainError('invalid_input', 'Socio no se asigna: sale de la membresía') };
  if (input.roleCode === 'superadmin' && !actor.isSuperadmin) return { ok: false, error: new DomainError('forbidden', 'Solo un superadmin puede dar ese rol') };
  if (input.scopeType !== 'club' && !SCOPE_ID.test(scopeId)) return { ok: false, error: new DomainError('invalid_input', 'Indicá el ámbito: minúsculas, números y guiones (por ejemplo rugby-m19)') };
  const [role, person] = await Promise.all([db.role.findUnique({ where: { code: input.roleCode } }), db.person.findUnique({ where: { id: input.personId }, select: { id: true } })]);
  if (!role) return { ok: false, error: new DomainError('invalid_input', 'Rol inexistente') };
  if (!person) return { ok: false, error: new DomainError('not_found', 'Persona inexistente') };
  const key = { personId: input.personId, roleCode: input.roleCode, scopeType: input.scopeType, scopeId };
  const existing = await db.roleAssignment.findUnique({ where: { personId_roleCode_scopeType_scopeId: key } });
  if (existing?.active) return { ok: false, error: new DomainError('conflict', 'La persona ya tiene ese rol con ese ámbito') };
  const id = await db.$transaction(async (tx) => {
    const a = existing ? await tx.roleAssignment.update({ where: { id: existing.id }, data: { active: true } }) : await tx.roleAssignment.create({ data: key });
    await tx.auditLog.create({
      data: { actorPersonId: actor.personId, action: 'role.assigned', entityType: 'person', entityId: input.personId, diff: { role: input.roleCode, scope: scopeLabel(input.scopeType, scopeId) } },
    });
    await appendOutbox(tx, createEvent('role.assigned', 'identity', { personId: input.personId, roleCode: input.roleCode, scopeType: input.scopeType, scopeId }));
    return a.id;
  });
  return { ok: true, value: { id } };
}

/** Quita un rol. Nunca deja al club sin superadmin, y un superadmin solo lo quita otro. */
export async function revokeRole(db: PrismaClient, actor: { personId: string; isSuperadmin: boolean }, assignmentId: string): Promise<Result<{ id: string }>> {
  const a = await db.roleAssignment.findUnique({ where: { id: assignmentId } });
  if (!a || !a.active) return { ok: false, error: new DomainError('not_found', 'Ese rol ya no está asignado') };
  if (a.roleCode === 'superadmin') {
    if (!actor.isSuperadmin) return { ok: false, error: new DomainError('forbidden', 'Solo un superadmin puede quitar ese rol') };
    const others = await db.roleAssignment.count({ where: { roleCode: 'superadmin', active: true, id: { not: a.id } } });
    if (others === 0) return { ok: false, error: new DomainError('conflict', 'Es el único superadmin: asigná otro antes de quitarlo') };
  }
  await db.$transaction(async (tx) => {
    await tx.roleAssignment.update({ where: { id: a.id }, data: { active: false } });
    await tx.auditLog.create({
      data: { actorPersonId: actor.personId, action: 'role.revoked', entityType: 'person', entityId: a.personId, diff: { role: a.roleCode, scope: scopeLabel(a.scopeType, a.scopeId) } },
    });
    await appendOutbox(tx, createEvent('role.revoked', 'identity', { personId: a.personId, roleCode: a.roleCode, scopeType: a.scopeType, scopeId: a.scopeId }));
  });
  return { ok: true, value: { id: a.id } };
}

/** Ámbitos ya usados en el club, para sugerirlos al asignar (hasta que Deportes y los módulos los publiquen). */
export async function knownScopes(db: PrismaClient): Promise<Array<{ scopeType: string; scopeId: string }>> {
  const rows = await db.roleAssignment.findMany({ where: { scopeType: { not: 'club' } }, distinct: ['scopeType', 'scopeId'], select: { scopeType: true, scopeId: true }, orderBy: [{ scopeType: 'asc' }, { scopeId: 'asc' }] });
  return rows;
}

export interface InstitutionalSummary {
  activeMembers: number;
  newThisMonth: number;
  leftThisMonth: number;
  suspended: number;
  people: number;
  byCategory: Array<{ name: string; count: number }>;
  pendingAccounts: number;
  lockedAccounts: number;
  withoutAccount: number;
  staff: number;
}

/** Números del padrón para el inicio institucional (mes calendario en curso, UTC). */
export async function institutionalSummary(db: PrismaClient, at = new Date()): Promise<InstitutionalSummary> {
  const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const active = { status: 'active' as const, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] };
  const [activeMembers, newThisMonth, leftThisMonth, suspended, people, categories, pendingAccounts, lockedAccounts, withoutAccount, staff] = await Promise.all([
    db.clubMembership.count({ where: active }),
    db.clubMembership.count({ where: { validFrom: { gte: monthStart, lte: at } } }),
    db.membershipStatusChange.count({ where: { changedAt: { gte: monthStart }, toStatus: { in: ['resigned', 'inactive'] } } }),
    db.clubMembership.count({ where: { status: 'suspended' } }),
    db.person.count(),
    db.membershipCategory.findMany({ where: { active: true }, select: { name: true, _count: { select: { memberships: { where: active } } } } }),
    db.userAccount.count({ where: { status: 'pending' } }),
    db.userAccount.count({ where: { status: 'locked' } }),
    db.person.count({ where: { account: null, birthDate: { lte: eighteenYearsBefore(at) } } }),
    db.person.count({ where: { roles: { some: { active: true } } } }),
  ]);
  return {
    activeMembers,
    newThisMonth,
    leftThisMonth,
    suspended,
    people,
    byCategory: categories.map((c) => ({ name: c.name, count: c._count.memberships })).sort((a, b) => b.count - a.count),
    pendingAccounts,
    lockedAccounts,
    withoutAccount,
    staff,
  };
}

export interface RegisterPersonInput {
  firstName: string;
  lastName: string;
  document?: string | null;
  birthDate?: Date | null;
  email?: string | null;
  phone?: string | null;
  /** Membresía social opcional: categoría por código y N° de socio (si no, el siguiente libre). */
  membership?: { categoryCode: string; memberNumber?: string | null; validFrom?: Date } | null;
}

async function nextMemberNumber(tx: Prisma.TransactionClient): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ n: number | null }>>`SELECT max(("memberNumber")::int) AS n FROM "ClubMembership" WHERE "memberNumber" ~ '^[0-9]{1,9}$'`;
  return String((rows[0]?.n ?? 0) + 1);
}

/**
 * Alta de persona desde la administración. Una persona existe una sola vez por club: si el documento
 * ya está en el padrón, devuelve `conflict` con su id en vez de duplicarla.
 */
export async function registerPerson(db: PrismaClient, actorPersonId: string, input: RegisterPersonInput, pepper: string | undefined, at = new Date()): Promise<Result<{ id: string; memberNumber: string | null }>> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) return { ok: false, error: new DomainError('invalid_input', 'Nombre y apellido son obligatorios') };
  let doc: { docDigest: string; docLast4: string } | null = null;
  if (input.document?.trim()) {
    if (!pepper) return { ok: false, error: new DomainError('invalid_input', 'Esta instalación no tiene configurada la clave de documentos') };
    try {
      doc = documentDigest(input.document, pepper);
    } catch {
      return { ok: false, error: new DomainError('invalid_input', 'Documento inválido') };
    }
    const existing = await db.person.findUnique({ where: { docDigest: doc.docDigest }, select: { id: true } });
    if (existing) return { ok: false, error: new DomainError('conflict', 'Ya hay una persona con ese documento', { personId: existing.id }) };
  }
  if (input.birthDate && input.birthDate > at) return { ok: false, error: new DomainError('invalid_input', 'La fecha de nacimiento no puede ser futura') };
  const category = input.membership ? await db.membershipCategory.findUnique({ where: { code: input.membership.categoryCode } }) : null;
  if (input.membership && (!category || !category.active)) return { ok: false, error: new DomainError('invalid_input', 'Categoría inexistente') };
  const wanted = input.membership?.memberNumber?.trim() || null;
  if (wanted && !/^\d{1,9}$/.test(wanted)) return { ok: false, error: new DomainError('invalid_input', 'El N° de socio son solo números') };
  if (wanted && (await db.clubMembership.findUnique({ where: { memberNumber: wanted } }))) return { ok: false, error: new DomainError('conflict', 'Ese N° de socio ya está usado') };

  return db.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: { firstName, lastName, email: input.email?.trim().toLowerCase() || null, phone: input.phone?.trim() || null, birthDate: input.birthDate ?? null, ...(doc ?? {}) },
    });
    let memberNumber: string | null = null;
    if (category) {
      memberNumber = wanted ?? (await nextMemberNumber(tx));
      const m = await tx.clubMembership.create({ data: { personId: person.id, categoryId: category.id, memberNumber, validFrom: input.membership?.validFrom ?? at } });
      await tx.membershipStatusChange.create({ data: { membershipId: m.id, toStatus: 'active', reason: 'Alta', changedById: actorPersonId } });
    }
    await tx.auditLog.create({
      data: { actorPersonId, action: 'person.created', entityType: 'person', entityId: person.id, diff: { membership: category ? { category: category.name, memberNumber } : null } },
    });
    await appendOutbox(tx, createEvent('person.created', 'identity', { personId: person.id, member: Boolean(category) }));
    return { ok: true as const, value: { id: person.id, memberNumber } };
  });
}

export async function membershipCategories(db: PrismaClient) {
  return db.membershipCategory.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { code: true, name: true } });
}
