/**
 * Retiro autorizado de menores (lienzo «Pueden retirarla»): además de sus responsables, el menor
 * puede ser retirado por personas que la familia autoriza con su documento. La persona autorizada
 * existe una sola vez en el padrón (se busca por documento) y el documento queda como digest +
 * últimos 4. Vale para todas las actividades del club hasta que se revoca.
 */
import type { PrismaClient } from '@clumera/db';
import { DomainError, type Result } from '@clumera/kernel';
import { guardiansOf } from './family';
import { findOrCreatePerson } from './people';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;
export const MAX_PICKUPS = 6;

export interface PickupInput {
  minorId: string;
  firstName: string;
  lastName: string;
  relation: string;
  document: string;
  phone?: string;
}

export async function authorizePickup(db: PrismaClient, actorPersonId: string, input: PickupInput, pepper: string): Promise<Result<{ id: string; personId: string }>> {
  const relation = input.relation.trim().slice(0, 40);
  if (input.firstName.trim().length < 2 || input.lastName.trim().length < 2) return fail('invalid_input', 'Escribí nombre y apellido');
  if (relation.length < 3) return fail('invalid_input', 'Indicá el vínculo (abuela, tío, vecina…)');
  if (input.document.replace(/[^0-9a-z]/gi, '').length < 6) return fail('invalid_input', 'Revisá el documento');
  const active = await db.pickupAuthorization.count({ where: { minorId: input.minorId, OR: [{ validTo: null }, { validTo: { gt: new Date() } }] } });
  if (active >= MAX_PICKUPS) return fail('conflict', `Hasta ${MAX_PICKUPS} personas autorizadas`);
  const { person } = await findOrCreatePerson(db, { firstName: input.firstName, lastName: input.lastName, phone: input.phone ?? null, document: input.document }, pepper);
  if (person.id === input.minorId) return fail('invalid_input', 'No puede autorizarse a sí mismo');
  if ((await guardiansOf(db, input.minorId)).includes(person.id)) return fail('conflict', 'Es responsable: ya puede retirarlo');
  const a = await db.pickupAuthorization.upsert({
    where: { minorId_authorizedPersonId: { minorId: input.minorId, authorizedPersonId: person.id } },
    create: { minorId: input.minorId, authorizedPersonId: person.id, note: relation },
    update: { note: relation, validFrom: new Date(), validTo: null },
  });
  await db.auditLog.create({ data: { actorPersonId, action: 'pickup.authorized', entityType: 'person', entityId: input.minorId, diff: { authorizedPersonId: person.id, relation } } });
  return { ok: true, value: { id: a.id, personId: person.id } };
}

export async function revokePickup(db: PrismaClient, actorPersonId: string, id: string): Promise<Result<{ id: string; minorId: string }>> {
  const a = await db.pickupAuthorization.findUnique({ where: { id } });
  if (!a) return fail('not_found', 'Autorización inexistente');
  if (a.validTo && a.validTo <= new Date()) return fail('conflict', 'Ya estaba revocada');
  await db.pickupAuthorization.update({ where: { id }, data: { validTo: new Date() } });
  await db.auditLog.create({ data: { actorPersonId, action: 'pickup.revoked', entityType: 'person', entityId: a.minorId, diff: { authorizedPersonId: a.authorizedPersonId } } });
  return { ok: true, value: { id, minorId: a.minorId } };
}

/** Quiénes pueden retirar a cada menor: responsables (titulares) y autorizados vigentes. */
export async function pickupsFor(db: PrismaClient, minorIds: string[], at = new Date()) {
  const [auth, guardians] = await Promise.all([
    db.pickupAuthorization.findMany({
      where: { minorId: { in: minorIds }, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] },
      orderBy: { validFrom: 'asc' },
      include: { authorizedPerson: { select: { firstName: true, lastName: true, docLast4: true } } },
    }),
    db.familyRelationship.findMany({
      where: { role: 'guardian', group: { members: { some: { personId: { in: minorIds }, role: 'dependent' } } } },
      include: { person: { select: { id: true, firstName: true, lastName: true } }, group: { select: { members: { where: { role: 'dependent' }, select: { personId: true } } } } },
    }),
  ]);
  const out = new Map<string, Array<{ id: string | null; name: string; relation: string; holder: boolean; docLast4: string | null }>>(minorIds.map((id) => [id, []]));
  for (const g of guardians)
    for (const d of g.group.members)
      if (out.has(d.personId) && !out.get(d.personId)!.some((x) => x.holder && x.name === `${g.person.firstName} ${g.person.lastName}`))
        out.get(d.personId)!.push({ id: null, name: `${g.person.firstName} ${g.person.lastName}`, relation: g.relation ?? 'Responsable', holder: true, docLast4: null });
  for (const a of auth) out.get(a.minorId)!.push({ id: a.id, name: `${a.authorizedPerson.firstName} ${a.authorizedPerson.lastName}`, relation: a.note ?? 'Autorizado', holder: false, docLast4: a.authorizedPerson.docLast4 });
  return out;
}
