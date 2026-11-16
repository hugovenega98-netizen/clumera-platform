/**
 * Grupo familiar: una persona responsable administra a sus representados (sin cuenta propia) y ve a
 * los demás miembros del grupo. Ser responsable no da acceso a la cuenta de otro adulto.
 */
import type { PrismaClient } from '@clumera/db';

export async function isGuardianOf(db: PrismaClient, guardianId: string, personId: string): Promise<boolean> {
  if (guardianId === personId) return true;
  const link = await db.familyRelationship.findFirst({
    where: { personId, role: 'dependent', group: { members: { some: { personId: guardianId, role: 'guardian' } } } },
    select: { id: true },
  });
  return Boolean(link);
}

/** Responsables de una persona (para tratarlos como dueños del recurso en `can()`). */
export async function guardiansOf(db: PrismaClient, personId: string): Promise<string[]> {
  const rows = await db.familyRelationship.findMany({
    where: { role: 'guardian', group: { members: { some: { personId, role: 'dependent' } } } },
    select: { personId: true },
  });
  return [...new Set(rows.map((r) => r.personId))];
}

function age(birth: Date | null, at: Date): number | null {
  if (!birth) return null;
  let a = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) a--;
  return a;
}

export interface FamilyMemberView {
  personId: string;
  firstName: string;
  lastName: string;
  age: number | null;
  role: 'guardian' | 'dependent' | 'member';
  relation: string | null;
  isSelf: boolean;
  hasAccount: boolean;
  /** La persona que mira puede administrarla (es ella misma o su representado). */
  manageable: boolean;
  membership: { category: string; status: string; number: string | null } | null;
}

export async function familyView(db: PrismaClient, personId: string, at = new Date()) {
  const groups = await db.familyGroup.findMany({
    where: { members: { some: { personId } } },
    include: {
      members: {
        include: {
          person: {
            include: {
              account: { select: { id: true } },
              memberships: { orderBy: { validFrom: 'desc' }, take: 1, include: { category: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return groups.map((g) => {
    const me = g.members.find((m) => m.personId === personId);
    const iAmGuardian = me?.role === 'guardian';
    const order = { guardian: 0, member: 1, dependent: 2 } as const;
    const members: FamilyMemberView[] = g.members
      .map((m) => ({
        personId: m.personId,
        firstName: m.person.firstName,
        lastName: m.person.lastName,
        age: age(m.person.birthDate, at),
        role: m.role,
        relation: m.relation,
        isSelf: m.personId === personId,
        hasAccount: Boolean(m.person.account),
        manageable: m.personId === personId || (iAmGuardian && m.role === 'dependent'),
        membership: m.person.memberships[0]
          ? { category: m.person.memberships[0].category.name, status: m.person.memberships[0].status, number: m.person.memberships[0].memberNumber }
          : null,
      }))
      .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || order[a.role] - order[b.role] || a.firstName.localeCompare(b.firstName));
    return { id: g.id, name: g.name, iAmGuardian, members };
  });
}
