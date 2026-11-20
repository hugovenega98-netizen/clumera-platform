/**
 * Colonia de verano (lienzo «Inscripción a colonia» y «Colonia de vacaciones»): la familia inscribe
 * a cada chico en un grupo por edad y turno; el lugar queda tomado («pendiente») hasta que se
 * aprueban los documentos obligatorios y se acredita el pago. Desde la segunda inscripción de la
 * misma familia hay descuento. El retiro autorizado vive en Identidad (vale para todo el club).
 *
 * Caso C del plan: una familia inscribe a dos hijos con documentos y retiro autorizado.
 */
import type { PrismaClient } from '@clumera/db';
import { appendOutbox } from '@clumera/db';
import { ageOn, enroll, occupancy, withdraw } from '@clumera/enrollment';
import { storeFile } from '@clumera/files';
import { cancelCharge, issueCharge } from '@clumera/finance';
import { membershipActive } from '@clumera/identity';
import { createEvent, DomainError, type Result } from '@clumera/kernel';

const MODULE = 'summer';
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;
const clubDay = (now: Date) => new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

async function isMember(db: PrismaClient, personId: string, now: Date) {
  const m = await db.clubMembership.findFirst({ where: { personId }, orderBy: { validFrom: 'desc' }, select: { status: true, validFrom: true, validTo: true } });
  return membershipActive(m ?? undefined, now);
}

/** Propuestas de colonia abiertas con grupos, lugares y documentos pedidos. */
export async function campPrograms(db: PrismaClient) {
  const programs = await db.program.findMany({
    where: { module: MODULE, status: 'open' },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { groups: { where: { active: true }, orderBy: [{ name: 'asc' }, { startMinute: 'asc' }] }, documents: { orderBy: { sortOrder: 'asc' } } },
  });
  const occ = await occupancy(db, programs.flatMap((p) => p.groups.map((g) => g.id)));
  return programs.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, ...occ.get(g.id)!, free: Math.max(0, g.capacity - occ.get(g.id)!.taken) })) }));
}

/** Cuota de la colonia para una persona: socio o general, con descuento familiar desde la segunda. */
export async function campFee(db: PrismaClient, program: { id: string; memberFee: number; guestFee: number; familyDiscountPercent: number }, personId: string, familyIds: string[], now = new Date()) {
  const member = await isMember(db, personId, now);
  const base = member ? program.memberFee : program.guestFee;
  const siblings = await db.enrollment.count({ where: { personId: { in: familyIds.filter((id) => id !== personId) }, status: { not: 'withdrawn' }, group: { programId: program.id } } });
  const discount = siblings > 0 ? program.familyDiscountPercent : 0;
  return { member, base, discount, fee: Math.round((base * (100 - discount)) / 100) };
}

/** Por qué no puede inscribirse (edad); null si puede. */
export async function campIneligible(db: PrismaClient, program: { minAge: number | null; maxAge: number | null; membersOnly: boolean }, personId: string, now = new Date()) {
  const p = await db.person.findUnique({ where: { id: personId }, select: { birthDate: true } });
  if (program.membersOnly && !(await isMember(db, personId, now))) return 'Es solo para socios';
  if (program.minAge === null && program.maxAge === null) return null;
  if (!p?.birthDate) return 'Falta la fecha de nacimiento en la ficha';
  const age = ageOn(p.birthDate, clubDay(now));
  if ((program.minAge !== null && age < program.minAge) || (program.maxAge !== null && age > program.maxAge)) return `Es de ${program.minAge ?? 0} a ${program.maxAge ?? 99} años`;
  return null;
}

async function chargeCamp(db: PrismaClient, actorPersonId: string, enrollmentId: string, now: Date) {
  const e = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { group: { include: { program: true } } } });
  if (e.fee <= 0 || e.chargeId) return e.chargeId;
  const c = await issueCharge(db, actorPersonId, {
    personId: e.personId,
    concept: 'colonia',
    groupLabel: e.group.program.name,
    description: `${e.group.program.name} · ${e.group.name}`,
    amount: e.fee,
    dueDate: new Date(Date.parse(`${clubDay(now)}T00:00:00Z`) + 7 * 86_400_000),
    source: MODULE,
    sourceRef: e.id,
  });
  if (!c.ok) return null;
  await db.enrollment.update({ where: { id: e.id }, data: { chargeId: c.value.id } });
  return c.value.id;
}

/** Inscribe a un chico (lo hace su responsable): con lugar queda pendiente y con su cargo; si no, espera. */
export async function enrollInCamp(db: PrismaClient, actorPersonId: string, input: { groupId: string; personId: string; familyIds: string[] }, now = new Date()) {
  const group = await db.group.findUnique({ where: { id: input.groupId }, include: { program: true } });
  if (!group?.active || group.program.module !== MODULE) return fail('not_found', 'Grupo inexistente');
  const why = await campIneligible(db, group.program, input.personId, now);
  if (why) return fail('conflict', why);
  const fee = await campFee(db, group.program, input.personId, input.familyIds, now);
  const r = await enroll(db, { groupId: group.id, personId: input.personId, actorPersonId, memberRate: fee.member, fee: fee.fee, onSeat: 'pending' }, now);
  if (!r.ok) return r;
  const chargeId = r.value.status === 'pending' ? await chargeCamp(db, actorPersonId, r.value.id, now) : null;
  return { ok: true as const, value: { ...r.value, chargeId, fee: fee.fee, discount: fee.discount } };
}

/** Estado de la documentación y el pago de una inscripción de colonia. */
export async function campChecklist(db: PrismaClient, enrollmentId: string) {
  const e = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      person: { select: { id: true, firstName: true, lastName: true, birthDate: true } },
      group: { include: { program: { include: { documents: { orderBy: { sortOrder: 'asc' } } } } } },
      documents: { include: { file: { select: { id: true, filename: true, createdAt: true } } } },
    },
  });
  if (!e || e.group.program.module !== MODULE) return null;
  const charge = e.chargeId ? await db.charge.findUnique({ where: { id: e.chargeId }, select: { id: true, amount: true, paidAmount: true, status: true } }) : null;
  const docs = e.group.program.documents.map((d) => {
    const got = e.documents.find((x) => x.documentId === d.id);
    return { id: d.id, code: d.code, label: d.label, required: d.required, sensitive: d.sensitive, status: got?.status ?? ('missing' as const), note: got?.note ?? null, file: got?.file ?? null, itemId: got?.id ?? null };
  });
  const docsOk = docs.every((d) => !d.required || d.status === 'approved');
  const paid = !charge || charge.status === 'paid' || charge.paidAmount >= charge.amount;
  return { enrollment: e, docs, charge, docsOk, paid, pendingDocs: docs.filter((d) => d.required && d.status !== 'approved').length };
}

/** Con documentos aprobados y pago acreditado, la inscripción pendiente queda confirmada. */
export async function refreshCampEnrollment(db: PrismaClient, enrollmentId: string, now = new Date()): Promise<'confirmed' | 'pending' | 'other'> {
  const c = await campChecklist(db, enrollmentId);
  if (!c || c.enrollment.status !== 'pending') return 'other';
  if (!c.docsOk || !c.paid) return 'pending';
  const done = await db.$transaction(async (tx) => {
    const u = await tx.enrollment.updateMany({ where: { id: enrollmentId, status: 'pending' }, data: { status: 'confirmed', confirmedAt: now } });
    if (u.count) await appendOutbox(tx, createEvent('enrollment.confirmed', MODULE, { enrollmentId, groupId: c.enrollment.groupId, personId: c.enrollment.personId }));
    return u.count > 0;
  });
  return done ? 'confirmed' : 'other';
}

/** Para el consumidor de `payment.approved`: re-evalúa las inscripciones de colonia de esos cargos. */
export async function confirmPaidCamp(db: PrismaClient, chargeIds: string[], now = new Date()) {
  const rows = await db.enrollment.findMany({ where: { chargeId: { in: chargeIds }, status: 'pending', group: { program: { module: MODULE } } }, select: { id: true } });
  const out: string[] = [];
  for (const r of rows) if ((await refreshCampEnrollment(db, r.id, now)) === 'confirmed') out.push(r.id);
  return out;
}

/** La familia sube (o reemplaza) un documento. Un rechazo vuelve a «presentado» al subir otro. */
export async function submitCampDocument(db: PrismaClient, actorPersonId: string, input: { enrollmentId: string; code: string; filename: string; bytes: Uint8Array }): Promise<Result<{ id: string }>> {
  const e = await db.enrollment.findUnique({ where: { id: input.enrollmentId }, include: { group: { include: { program: { include: { documents: true } } } } } });
  if (!e || e.group.program.module !== MODULE || e.status === 'withdrawn') return fail('not_found', 'Inscripción inexistente');
  const doc = e.group.program.documents.find((d) => d.code === input.code);
  if (!doc) return fail('not_found', 'Ese documento no se pide en esta colonia');
  const current = await db.enrollmentDocument.findUnique({ where: { enrollmentId_documentId: { enrollmentId: e.id, documentId: doc.id } } });
  if (current?.status === 'approved') return fail('conflict', 'Ese documento ya está aprobado');
  const f = await storeFile(db, { ownerPersonId: e.personId, uploadedById: actorPersonId, purpose: `colonia:${doc.code}`, filename: input.filename, bytes: input.bytes, sensitive: doc.sensitive });
  if (!f.ok) return f;
  const item = await db.enrollmentDocument.upsert({
    where: { enrollmentId_documentId: { enrollmentId: e.id, documentId: doc.id } },
    create: { enrollmentId: e.id, documentId: doc.id, fileId: f.value.id },
    update: { fileId: f.value.id, status: 'submitted', note: null, reviewedById: null, reviewedAt: null },
  });
  return { ok: true, value: { id: item.id } };
}

/** La coordinación aprueba o rechaza (con motivo) un documento. Aprobar puede confirmar la inscripción. */
export async function reviewCampDocument(db: PrismaClient, actorPersonId: string, itemId: string, decision: { approve: boolean; note?: string }, now = new Date()): Promise<Result<{ status: string; enrollment: 'confirmed' | 'pending' | 'other' }>> {
  const item = await db.enrollmentDocument.findUnique({ where: { id: itemId }, include: { enrollment: { select: { id: true, personId: true, status: true } }, requirement: { select: { label: true } } } });
  if (!item) return fail('not_found', 'Documento inexistente');
  if (item.status !== 'submitted') return fail('conflict', 'Ese documento ya fue revisado');
  const note = decision.note?.trim().slice(0, 200) || null;
  if (!decision.approve && (!note || note.length < 5)) return fail('invalid_input', 'Indicá por qué se rechaza');
  await db.$transaction(async (tx) => {
    await tx.enrollmentDocument.update({ where: { id: item.id }, data: { status: decision.approve ? 'approved' : 'rejected', note, reviewedById: actorPersonId, reviewedAt: now } });
    await tx.auditLog.create({ data: { actorPersonId, action: decision.approve ? 'camp.document_approved' : 'camp.document_rejected', entityType: 'person', entityId: item.enrollment.personId, diff: { enrollmentId: item.enrollment.id, document: item.requirement.label } } });
    if (!decision.approve) await appendOutbox(tx, createEvent('camp.document_rejected', MODULE, { enrollmentId: item.enrollment.id, personId: item.enrollment.personId, document: item.requirement.label, note }));
  });
  const enrollment = decision.approve ? await refreshCampEnrollment(db, item.enrollment.id, now) : 'pending';
  return { ok: true, value: { status: decision.approve ? 'approved' : 'rejected', enrollment } };
}

/** Uso de imagen y contacto de emergencia (sin datos clínicos). */
export async function setCampDetails(db: PrismaClient, enrollmentId: string, input: { imageConsent: boolean; emergencyName: string; emergencyPhone: string }): Promise<Result<{ id: string }>> {
  const name = input.emergencyName.trim().slice(0, 80);
  const phone = input.emergencyPhone.replace(/[^\d+]/g, '').slice(0, 20);
  if (name.length < 3) return fail('invalid_input', 'Escribí quién es el contacto de emergencia');
  if (phone.replace(/\D/g, '').length < 8) return fail('invalid_input', 'Revisá el teléfono de emergencia');
  await db.enrollment.update({ where: { id: enrollmentId }, data: { imageConsent: input.imageConsent, emergencyName: name, emergencyPhone: phone } });
  return { ok: true, value: { id: enrollmentId } };
}

/** Baja de colonia: anula el cargo impago; el primero en espera toma el lugar (pendiente) con su cargo. */
export async function withdrawFromCamp(db: PrismaClient, actorPersonId: string, enrollmentId: string, reason: string, now = new Date()) {
  const r = await withdraw(db, enrollmentId, actorPersonId, reason, { promoteTo: 'pending' }, now);
  if (!r.ok) return r;
  if (r.value.chargeId) {
    const c = await db.charge.findUnique({ where: { id: r.value.chargeId }, select: { status: true, paidAmount: true } });
    if (c?.status === 'pending' && c.paidAmount === 0) await cancelCharge(db, actorPersonId, r.value.chargeId, 'Baja de la colonia');
  }
  if (r.value.promoted) await chargeCamp(db, actorPersonId, r.value.promoted.id, now);
  return r;
}

/** Inscripciones de colonia de la familia. */
export async function familyCampEnrollments(db: PrismaClient, personIds: string[]) {
  return db.enrollment.findMany({
    where: { personId: { in: personIds }, status: { not: 'withdrawn' }, group: { program: { module: MODULE } } },
    orderBy: { createdAt: 'asc' },
    include: { person: { select: { id: true, firstName: true, lastName: true } }, group: { include: { program: { select: { name: true, slug: true } } } } },
  });
}

/** Panel de la coordinación: grupos con cupo, indicadores y documentos por revisar. */
export async function campAdmin(db: PrismaClient) {
  const programs = await db.program.findMany({ where: { module: MODULE }, orderBy: { sortOrder: 'asc' }, include: { groups: { orderBy: { name: 'asc' } } } });
  const groupIds = programs.flatMap((p) => p.groups.map((g) => g.id));
  const occ = await occupancy(db, groupIds);
  const active = await db.enrollment.findMany({
    where: { groupId: { in: groupIds }, status: { not: 'withdrawn' } },
    orderBy: { createdAt: 'desc' },
    include: { person: { select: { id: true, firstName: true, lastName: true } }, group: { select: { name: true } }, documents: { select: { status: true } } },
  });
  const charges = await db.charge.findMany({ where: { id: { in: active.flatMap((e) => (e.chargeId ? [e.chargeId] : [])) } }, select: { id: true, status: true, amount: true, paidAmount: true } });
  const paid = new Set(charges.filter((c) => c.status === 'paid' || c.paidAmount >= c.amount).map((c) => c.id));
  const required = new Map(await Promise.all(programs.map(async (p) => [p.id, await db.programDocument.count({ where: { programId: p.id, required: true } })] as const)));
  const programOf = new Map(programs.flatMap((p) => p.groups.map((g) => [g.id, p.id] as const)));
  const rows = active.map((e) => {
    const approved = e.documents.filter((d) => d.status === 'approved').length;
    return { ...e, paid: !e.chargeId || paid.has(e.chargeId), docsMissing: Math.max(0, (required.get(programOf.get(e.groupId)!) ?? 0) - approved), docsToReview: e.documents.filter((d) => d.status === 'submitted').length };
  });
  const capacity = programs.reduce((n, p) => n + p.groups.filter((g) => g.active).reduce((a, g) => a + g.capacity, 0), 0);
  return {
    programs: programs.map((p) => ({ ...p, groups: p.groups.map((g) => ({ ...g, ...occ.get(g.id)! })) })),
    rows,
    kpis: {
      confirmed: rows.filter((r) => r.status === 'confirmed').length,
      capacity,
      pendingPayment: rows.filter((r) => r.status === 'pending' && !r.paid).length,
      waitlist: rows.filter((r) => r.status === 'waitlist').length,
      docsIncomplete: rows.filter((r) => r.status === 'pending' && r.docsMissing > 0).length,
    },
  };
}
