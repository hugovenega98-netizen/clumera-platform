import { baseRoles, roleNames } from '@clumera/catalog';
import type { PrismaClient } from '@clumera/db';
import { issueCharge, issueMonthlyDues, periodLabel, periodOf, recordPayment } from '@clumera/finance';
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
      (
        [
          ['activo', 'Activo', 22_000_00],
          ['cadete', 'Cadete', 12_000_00],
          ['vitalicio', 'Vitalicio', null],
        ] as const
      ).map(async ([code, name, monthlyFee]) => [code, await db.membershipCategory.upsert({ where: { code }, create: { code, name, monthlyFee }, update: { monthlyFee } })] as const),
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

  // Padrón para la administración: más socios, una familia con menores, una suspendida, una baja,
  // altas de este mes y alguien con rol fuera de los perfiles (ámbitos para sugerir al asignar).
  const PADRON: Array<[string, string, keyof typeof categories | null, { birth?: string; status?: 'suspended' | 'resigned'; recent?: boolean; email?: boolean }]> = [
    ['Martina', 'Gómez', 'activo', { birth: '1995-04-12', email: true }],
    ['Sofía', 'Gómez', 'cadete', { birth: '2017-02-01' }],
    ['Joaquín', 'Gómez', 'cadete', { birth: '2012-09-20' }],
    ['Lucas', 'Benítez', 'activo', { birth: '1988-11-03' }],
    ['Ramiro', 'Ortiz', 'vitalicio', { birth: '1950-06-30' }],
    ['Julieta', 'Méndez', 'activo', { birth: '1991-01-17', status: 'suspended' }],
    ['Andrés', 'Quiroga', 'activo', { birth: '1979-08-08', status: 'resigned' }],
    ['Camila', 'Torres', 'activo', { birth: '2000-12-01', recent: true, email: true }],
    ['Bruno', 'Ferrari', 'cadete', { birth: '2010-03-15', recent: true }],
    ['Valentina', 'Rossi', 'activo', { birth: '1997-07-22' }],
    ['Gonzalo', 'Núñez', 'activo', { birth: '1985-05-05' }],
    ['Ana', 'Castro', null, { birth: '2003-10-10', email: true }],
    ['Diego', 'Herrera', null, {}],
  ];
  const today = new Date();
  const thisMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const padron: Record<string, string> = {};
  for (const [firstName, lastName, cat, o] of PADRON) {
    const person = await db.person.create({
      data: {
        firstName,
        lastName,
        birthDate: o.birth ? new Date(o.birth) : null,
        email: o.email ? `${firstName}.${lastName}`.normalize('NFD').replace(/[^a-zA-Z.]/g, '').toLowerCase() + '@example.com' : null,
        ...(cat
          ? {
              memberships: {
                create: {
                  categoryId: categories[cat]!.id,
                  memberNumber: String(++memberNumber),
                  validFrom: o.recent ? thisMonth : since,
                  status: o.status === 'suspended' ? 'suspended' : o.status === 'resigned' ? 'resigned' : 'active',
                },
              },
            }
          : {}),
      },
      include: { memberships: true },
    });
    padron[`${firstName} ${lastName}`] = person.id;
    const m = person.memberships[0];
    if (m && o.status) await db.membershipStatusChange.create({ data: { membershipId: m.id, fromStatus: 'active', toStatus: m.status, reason: o.status === 'suspended' ? 'Falta de pago' : 'Renuncia', changedAt: thisMonth } });
  }
  await db.familyGroup.create({
    data: {
      name: 'Familia Gómez',
      members: {
        create: [
          { personId: padron['Martina Gómez']!, role: 'guardian', relation: 'madre' },
          { personId: padron['Sofía Gómez']!, role: 'dependent', relation: 'hija' },
          { personId: padron['Joaquín Gómez']!, role: 'dependent', relation: 'hijo' },
        ],
      },
    },
  });
  await db.roleAssignment.create({ data: { personId: padron['Lucas Benítez']!, roleCode: 'coach', scopeType: 'team', scopeId: 'rugby-m12' } });

  // Cuenta pendiente: el correo de activación queda en la bandeja de Lab para probar el circuito real.
  const pending = await db.person.create({
    data: { firstName: 'Pedro', lastName: 'Gil', email: 'pendiente@lab.clumera.app', memberships: { create: { categoryId: categories.activo!.id, memberNumber: String(memberNumber + 1), validFrom: since } } },
  });
  const auth = createAuthService({ db, mailer: options.mailer, settings: { ...DEFAULT_AUTH_SETTINGS, publicOrigin: options.publicOrigin, clubName: options.clubName } });
  const invited = await auth.inviteAccount({ personId: pending.id, login: 'pendiente@lab.clumera.app', email: 'pendiente@lab.clumera.app' }, null);
  if (!invited.ok) throw invited.error;

  // Finanzas al final: las cuotas alcanzan a todas las membresías sembradas.
  await seedFinance(db, padron);

  return { people: await db.person.count() };
}

/**
 * Finanzas de demo: cuotas de los últimos tres meses (las anteriores pagadas, con alguna morosa),
 * aranceles, la colonia de Tomás y cobros en caja con sus comprobantes.
 */
async function seedFinance(db: PrismaClient, padron: Record<string, string>): Promise<void> {
  const admin = await db.person.findFirstOrThrow({ where: { email: 'admin@lab.clumera.app' }, select: { id: true } });
  const ana = await db.person.findFirstOrThrow({ where: { email: 'socio@lab.clumera.app' }, select: { id: true } });
  const tomas = await db.person.findFirstOrThrow({ where: { firstName: 'Tomás', lastName: 'Fernández' }, select: { id: true } });
  const today = new Date();
  const periods = [2, 1, 0].map((back) => periodOf(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 15))));
  for (const period of periods) {
    const r = await issueMonthlyDues(db, admin.id, period, 10);
    if (!r.ok) throw r.error;
  }
  // Todos pagaron las cuotas de hace dos meses y el mes pasado, salvo Lucas Benítez (moroso).
  const late = padron['Lucas Benítez'];
  const old = await db.charge.findMany({ where: { concept: 'cuota_social', period: { in: periods.slice(0, 2) }, status: 'pending', personId: { not: late } }, orderBy: { createdAt: 'asc' } });
  for (const c of old) {
    const r = await recordPayment(db, admin.id, { payerPersonId: c.personId, chargeIds: [c.id], method: c.personId === ana.id ? 'transfer' : 'cash' });
    if (!r.ok) throw r.error;
  }
  const due = (days: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
  const charges = [
    { personId: ana.id, concept: 'arancel', groupLabel: 'Hockey', description: `Arancel ${periodLabel(periods[2]!).toLowerCase()}`, amount: 18_500_00, dueDate: due(5), ref: 'arancel-ana' },
    { personId: tomas.id, concept: 'colonia', groupLabel: 'Colonia de verano', description: 'Colonia enero · saldo', amount: 40_000_00, dueDate: due(25), ref: 'colonia-tomas' },
    { personId: tomas.id, concept: 'arancel', groupLabel: 'Rugby M12', description: 'Fichaje temporada', amount: 35_000_00, dueDate: due(-40), ref: 'fichaje-tomas' },
    { personId: padron['Martina Gómez']!, concept: 'arancel', groupLabel: 'Rugby XV', description: 'Arancel deportivo', amount: 18_500_00, dueDate: due(3), ref: 'arancel-martina' },
  ];
  for (const c of charges) {
    const r = await issueCharge(db, admin.id, { personId: c.personId, concept: c.concept, groupLabel: c.groupLabel, description: c.description, amount: c.amount, dueDate: c.dueDate, source: 'lab', sourceRef: c.ref });
    if (!r.ok) throw r.error;
  }
  // El fichaje de Tomás ya está pago.
  const fichaje = await db.charge.findFirstOrThrow({ where: { source: 'lab', sourceRef: 'fichaje-tomas' } });
  const r = await recordPayment(db, admin.id, { payerPersonId: ana.id, chargeIds: [fichaje.id], method: 'card' });
  if (!r.ok) throw r.error;
}

/** Vacía la base de Lab (todas las tablas salvo el historial de migraciones). Solo tras assertLabTarget. */
export async function wipeLab(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<Array<{ name: string }>>`
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.name.replace(/"/g, '')}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
