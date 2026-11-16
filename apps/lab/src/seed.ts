import { baseRoles, roleNames } from '@clumera/catalog';
import type { PrismaClient } from '@clumera/db';
import { createAuthService, DEFAULT_AUTH_SETTINGS, syncBaseRoles } from '@clumera/identity';
import type { Mailer } from '@clumera/mail';
import { LAB_PROFILES } from './profiles';

export interface SeedOptions {
  publicOrigin: string;
  clubName: string;
  mailer: Mailer;
}

/**
 * Datos base versionados de Lab (Fase 0): roles, categorías, los perfiles del selector, una
 * familia, personas inactivas y no socias, y una cuenta pendiente con su correo de activación en
 * la bandeja. Los dominios de cada hito (reservas, escuela, torneo…) se suman en sus fases.
 */
export async function seedLab(db: PrismaClient, options: SeedOptions): Promise<{ people: number }> {
  await syncBaseRoles(db, baseRoles, roleNames);
  const categories = Object.fromEntries(
    await Promise.all(
      [
        ['activo', 'Activo'],
        ['cadete', 'Cadete'],
        ['vitalicio', 'Vitalicio'],
      ].map(async ([code, name]) => [code, await db.membershipCategory.upsert({ where: { code: code! }, create: { code: code!, name: name! }, update: {} })] as const),
    ),
  );
  const since = new Date('2024-03-01');
  let memberNumber = 1000;

  for (const p of LAB_PROFILES) {
    const person = await db.person.create({
      data: {
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.login,
        account: { create: { login: p.login, status: 'active' } },
        roles: { create: p.roles.map((r) => ({ roleCode: r.role, scopeType: r.scopeType, scopeId: r.scopeId ?? '' })) },
        ...(p.membership
          ? { memberships: { create: { categoryId: categories[p.membership]!.id, memberNumber: String(++memberNumber), validFrom: since } } }
          : {}),
      },
    });
    if (p.key === 'socio') {
      const child = await db.person.create({
        data: {
          firstName: 'Tomás',
          lastName: 'Fernández',
          birthDate: new Date('2014-05-10'),
          memberships: { create: { categoryId: categories.cadete!.id, memberNumber: String(++memberNumber), validFrom: since } },
        },
      });
      await db.familyGroup.create({
        data: {
          name: 'Familia Fernández',
          members: { create: [{ personId: person.id, role: 'guardian', relation: 'madre' }, { personId: child.id, role: 'dependent', relation: 'hijo' }] },
        },
      });
    }
  }

  // Socia inactiva y persona no socia (cliente de reservas sin cuenta).
  await db.person.create({
    data: {
      firstName: 'Elena',
      lastName: 'Ortiz',
      memberships: { create: { categoryId: categories.activo!.id, memberNumber: String(++memberNumber), validFrom: since, status: 'inactive' } },
    },
  });
  await db.person.create({ data: { firstName: 'Raúl', lastName: 'Méndez', email: 'raul.cliente@example.com' } });

  // Cuenta pendiente: el correo de activación queda en la bandeja de Lab para probar el circuito real.
  const pending = await db.person.create({
    data: { firstName: 'Pedro', lastName: 'Gil', email: 'pendiente@lab.clumera.app', memberships: { create: { categoryId: categories.activo!.id, memberNumber: String(memberNumber + 1), validFrom: since } } },
  });
  const auth = createAuthService({ db, mailer: options.mailer, settings: { ...DEFAULT_AUTH_SETTINGS, publicOrigin: options.publicOrigin, clubName: options.clubName } });
  const invited = await auth.inviteAccount({ personId: pending.id, login: 'pendiente@lab.clumera.app', email: 'pendiente@lab.clumera.app' }, null);
  if (!invited.ok) throw invited.error;

  return { people: await db.person.count() };
}

/** Vacía la base de Lab (todas las tablas salvo el historial de migraciones). Solo tras assertLabTarget. */
export async function wipeLab(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<Array<{ name: string }>>`
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.name.replace(/"/g, '')}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
