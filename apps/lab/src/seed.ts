import { baseRoles, roleNames } from '@clumera/catalog';
import type { PrismaClient } from '@clumera/db';
import { issueCharge, issueMonthlyDues, periodLabel, periodOf, recordPayment } from '@clumera/finance';
import { createAuthService, createCredentialService, DEFAULT_AUTH_SETTINGS, syncBaseRoles } from '@clumera/identity';
import { checkAccess } from '@clumera/module-access';
import { createGroup, createProgram, enrollInSchool, markAttendance } from '@clumera/module-schools';
import { enrollInCamp, submitCampDocument } from '@clumera/module-summer';
import { createTournament, drawAndSchedule, recordResult, registerTeam } from '@clumera/module-tournaments';
import { clubDayOf, clubTime, placeSlot } from '@clumera/agenda';
import { cancelBooking, confirmPaidBookings, createBooking, createBookingSeries, createPublicBooking } from '@clumera/module-bookings';
import { addTariff, createBlock, createVenue, setBookingRule, setVenueStatus } from '@clumera/module-facilities';
import { createMatch, createSport, createTeam, recordEvaluation, reportInjury, setLineup, setTeamMember, teamFeeRows } from '@clumera/sports';
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
          members: {
            create: [
              { personId: person.id, role: 'guardian', relation: 'madre' },
              { personId: child.id, role: 'dependent', relation: 'hijo' },
              // Segunda hija (no socia): con Tomás, el caso C de colonia (dos hermanos).
              { personId: (await db.person.create({ data: { firstName: 'Lola', lastName: 'Fernández', birthDate: new Date('2018-03-03') } })).id, role: 'dependent', relation: 'hija' },
            ],
          },
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

  // Deportes y Finanzas al final: cuotas y aranceles alcanzan a todo lo sembrado.
  await seedSports(db, padron);
  await seedFinance(db, padron);
  await seedFacilities(db, padron);
  await seedAccess(db, padron);
  await seedSchools(db, (await db.person.findFirstOrThrow({ where: { email: 'admin@lab.clumera.app' }, select: { id: true } })).id);
  await seedCamp(db, padron);
  await seedTournaments(db, (await db.person.findFirstOrThrow({ where: { email: 'organizador@lab.clumera.app' }, select: { id: true } })).id);

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
    { personId: tomas.id, concept: 'colonia', groupLabel: 'Colonia de verano', description: 'Colonia enero · saldo', amount: 40_000_00, dueDate: due(25), ref: 'colonia-tomas' },
    { personId: tomas.id, concept: 'arancel', groupLabel: 'Rugby M12', description: 'Fichaje temporada', amount: 35_000_00, dueDate: due(-40), ref: 'fichaje-tomas' },
  ];
  for (const c of charges) {
    const r = await issueCharge(db, admin.id, { personId: c.personId, concept: c.concept, groupLabel: c.groupLabel, description: c.description, amount: c.amount, dueDate: c.dueDate, source: 'lab', sourceRef: c.ref });
    if (!r.ok) throw r.error;
  }
  // Aranceles del mes por equipo (como los emite Deportes): separados por deporte y equipo.
  const period = periods[2]!;
  const [py, pm] = period.split('-').map(Number) as [number, number];
  for (const row of await teamFeeRows(db, period)) {
    const r = await issueCharge(db, admin.id, {
      personId: row.personId,
      concept: 'arancel',
      groupLabel: row.groupLabel,
      description: `Arancel ${periodLabel(period).toLowerCase()}`,
      period,
      amount: row.amount,
      dueDate: new Date(Date.UTC(py, pm - 1, 25)),
      source: 'sports',
      sourceRef: row.sourceRef,
    });
    if (!r.ok) throw r.error;
  }
  // El fichaje de Tomás ya está pago.
  const fichaje = await db.charge.findFirstOrThrow({ where: { source: 'lab', sourceRef: 'fichaje-tomas' } });
  const r = await recordPayment(db, admin.id, { payerPersonId: ana.id, chargeIds: [fichaje.id], method: 'card' });
  if (!r.ok) throw r.error;
}

/**
 * Deportes de demo: Rugby (tres equipos), Hockey y Vóley. Ana juega dos deportes y es responsable de
 * Tomás (M12); Martín dirige M19 y juega en el plantel superior. M19 tiene un partido jugado con
 * incidencias y uno próximo con la convocatoria abierta; el plantel superior juega hoy (mesa).
 */
async function seedSports(db: PrismaClient, padron: Record<string, string>): Promise<void> {
  const admin = await db.person.findFirstOrThrow({ where: { email: 'admin@lab.clumera.app' }, select: { id: true } });
  const byEmail = async (email: string) => (await db.person.findFirstOrThrow({ where: { email }, select: { id: true } })).id;
  const ana = await byEmail('socio@lab.clumera.app');
  const martin = await byEmail('coach@lab.clumera.app');
  const tomas = (await db.person.findFirstOrThrow({ where: { firstName: 'Tomás', lastName: 'Fernández' }, select: { id: true } })).id;
  const ok = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };
  const sport = async (code: string, slug: string, name: string) => ok(await createSport(db, { code, slug, name })).id;
  const rugby = await sport('rugby_xv', 'rugby', 'Rugby');
  const hockey = await sport('hockey', 'hockey', 'Hockey');
  const voley = await sport('volleyball', 'voley', 'Vóley');
  const team = async (sportId: string, name: string, slug: string, fee: number) => ok(await createTeam(db, { sportId, name, slug, monthlyFee: fee })).id;
  const primera = await team(rugby, 'Plantel superior', 'rugby-primera', 20_000_00);
  const m19 = await team(rugby, 'M19', 'rugby-m19', 18_000_00);
  const m12 = await team(rugby, 'M12', 'rugby-m12', 15_000_00);
  const damas = await team(hockey, 'Damas', 'hockey-damas', 18_500_00);
  const mixto = await team(voley, 'Mixto', 'voley-mixto', 12_000_00);

  const juveniles: string[] = [];
  for (const [firstName, lastName, birth] of [
    ['Iván', 'Rojas', '2009-04-02'],
    ['Santino', 'Paz', '2009-08-19'],
    ['Felipe', 'Luna', '2010-01-30'],
  ] as const)
    juveniles.push((await db.person.create({ data: { firstName, lastName, birthDate: new Date(birth) } })).id);

  const members: Array<[string, string[]]> = [
    [primera, [martin, padron['Lucas Benítez']!, padron['Gonzalo Núñez']!]],
    [m19, [padron['Bruno Ferrari']!, ...juveniles]],
    [m12, [tomas, padron['Joaquín Gómez']!]],
    [damas, [ana, padron['Martina Gómez']!, padron['Valentina Rossi']!]],
    [mixto, [ana, padron['Camila Torres']!]],
  ];
  for (const [teamId, people] of members) for (const p of people) ok(await setTeamMember(db, teamId, p, true));

  const today = new Date();
  const dayAt = (offsetDays: number, hourUtc: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offsetDays, hourUtc));
  const nextSaturday = (6 - today.getUTCDay() + 7) % 7 || 7;

  // M19: jugado la semana pasada, con incidencias y marcador.
  const played = ok(await createMatch(db, martin, { teamId: m19, opponent: 'Atlético Sur', startsAt: dayAt(nextSaturday - 7, 14), home: true, venue: 'Cancha 1' })).id;
  await db.matchCallup.updateMany({ where: { matchId: played }, data: { response: 'going', respondedAt: dayAt(nextSaturday - 9, 12) } });
  ok(await setLineup(db, played, [padron['Bruno Ferrari']!, ...juveniles]));
  const ev = (type: string, side: 'own' | 'opponent', minute: number, personId?: string) => ({ matchId: played, type, side, minute, personId: personId ?? null, createdById: admin.id, createdAt: new Date(dayAt(nextSaturday - 7, 14).getTime() + minute * 60_000) });
  await db.matchEvent.createMany({
    data: [
      ev('try', 'own', 8, padron['Bruno Ferrari']),
      ev('conversion', 'own', 9, juveniles[0]),
      ev('penalty_goal', 'opponent', 15),
      ev('try', 'opponent', 31),
      ev('conversion', 'opponent', 32),
      ev('try', 'own', 47, juveniles[1]),
      ev('penalty_goal', 'own', 58, juveniles[0]),
      ev('yellow_card', 'own', 61, juveniles[2]),
      ev('try', 'own', 72, padron['Bruno Ferrari']),
      ev('conversion', 'own', 73, juveniles[0]),
      ev('try', 'opponent', 79),
    ],
  });
  await db.match.update({ where: { id: played }, data: { status: 'played', scoreFor: 24, scoreAgainst: 15 } });

  // Próximos: convocatorias abiertas.
  const next19 = ok(await createMatch(db, martin, { teamId: m19, opponent: 'Club Norte', startsAt: dayAt(nextSaturday, 14), home: false, venue: 'Club Norte' })).id;
  await db.matchCallup.updateMany({ where: { matchId: next19, personId: { in: [padron['Bruno Ferrari']!, juveniles[0]!] } }, data: { response: 'going', respondedAt: new Date() } });
  ok(await createMatch(db, martin, { teamId: m12, opponent: 'Club Norte', startsAt: dayAt(nextSaturday, 13), home: true, venue: 'Cancha 2' }));
  ok(await createMatch(db, martin, { teamId: damas, opponent: 'Lomas', startsAt: dayAt(nextSaturday + 1, 15), home: true, venue: 'Sintética' }));
  // Plantel superior: hoy, para probar la Mesa de control.
  const todayMatch = ok(await createMatch(db, admin.id, { teamId: primera, opponent: 'San Martín', startsAt: dayAt(0, 18), home: true, venue: 'Cancha 1' })).id;
  await db.matchCallup.updateMany({ where: { matchId: todayMatch }, data: { response: 'going', respondedAt: new Date() } });
  ok(await setLineup(db, todayMatch, [martin, padron['Lucas Benítez']!, padron['Gonzalo Núñez']!]));

  // Salud: un seguimiento abierto con evaluación (Gonzalo, Primera) y un reporte sin evaluar (Iván, M19).
  // Datos ficticios de Lab. El coach solo ve «Con restricciones» / «Pendiente de evaluación».
  const medico = await byEmail('medico@lab.clumera.app');
  const gonzalo = padron['Gonzalo Núñez']!;
  const injury = ok(await reportInjury(db, gonzalo, { personId: gonzalo, teamId: primera, zone: 'Hombro izquierdo', pain: 5, context: 'Partido', impact: 'Limita algunos ejercicios', onsetDate: dayAt(-6, 12), notes: 'Golpe en un tackle.' })).id;
  ok(await recordEvaluation(db, { personId: medico, name: 'Laura Paz' }, injury, { status: 'follow_up', availability: 'restricted', publicNote: 'Sin contacto por dos semanas; trabajo de movilidad.', privateNote: 'Ficticio de Lab: contusión, sin lesión estructural.' }));
  ok(await reportInjury(db, juveniles[0]!, { personId: juveniles[0]!, teamId: m19, zone: 'Tobillo derecho', pain: 3, context: 'Entrenamiento', impact: 'Puedo entrenar con molestia', onsetDate: dayAt(-1, 12) }));
}

/** Vacía la base de Lab (todas las tablas salvo el historial de migraciones). Solo tras assertLabTarget. */
/**
 * Instalaciones y reservas de demo: un club integral (fútbol 5, pádel, pileta, quincho, salón y
 * gimnasio), reglas y tarifas, ocupaciones de otros módulos en la agenda central y reservas en
 * todos los estados. Personas del padrón que no usan otras demos (Ana y Martina quedan libres).
 */
async function seedFacilities(db: PrismaClient, padron: Record<string, string>): Promise<void> {
  const ok = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };
  const admin = (await db.person.findFirst({ where: { firstName: 'Sofía', lastName: 'Ruiz' }, select: { id: true } }))!.id;
  const venue = async (slug: string, name: string, group: string, detail: string, sortOrder: number) => ok(await createVenue(db, admin, { slug, name, group, detail, sortOrder })).id;
  const f51 = await venue('f5-1', 'F5-1', 'Fútbol 5', 'Sintético', 1);
  const f52 = await venue('f5-2', 'F5-2', 'Fútbol 5', 'Sintético', 2);
  const p1 = await venue('padel-1', 'Pádel 1', 'Pádel', 'Techada', 3);
  const p2 = await venue('padel-2', 'Pádel 2', 'Pádel', 'Al aire libre', 4);
  const pileta = await venue('pileta', 'Pileta', 'Pileta', 'Temporada 26/27', 5);
  const quincho = await venue('quincho', 'Quincho', 'Quincho', '40 personas', 6);
  const salon = await venue('salon', 'Salón principal', 'Salón', '150 personas', 7);
  const gym = await venue('gimnasio', 'Gimnasio', 'Gimnasio', 'Aparatos y clases', 8);
  ok(await setVenueStatus(db, admin, gym, 'out_of_service', 'Reparación del piso'));

  const padelRule = { slotMinutes: 60, openFrom: 8 * 60, openTo: 23 * 60, maxAdvanceDays: 14, holdMinutes: 10, cancelHours: 24, depositPercent: 50, payAtClub: false };
  for (const id of [p1, p2]) {
    ok(await setBookingRule(db, admin, id, padelRule));
    ok(await addTariff(db, admin, id, { label: 'Mañana y tarde', days: 0b0011111, fromMinute: 8 * 60, toMinute: 18 * 60, memberPrice: 6_000_00, guestPrice: 9_000_00 }));
    ok(await addTariff(db, admin, id, { label: 'Fin de semana', days: 0b1100000, fromMinute: 8 * 60, toMinute: 18 * 60, memberPrice: 9_000_00, guestPrice: 12_000_00 }));
    ok(await addTariff(db, admin, id, { label: 'Noche', days: 127, fromMinute: 18 * 60, toMinute: 23 * 60, memberPrice: 9_000_00, guestPrice: 12_000_00 }));
  }
  for (const id of [f51, f52]) {
    // Fútbol 5 se reserva también sin cuenta (lienzo «Público · reservar sin cuenta»: seña 30%).
    ok(await setBookingRule(db, admin, id, { ...padelRule, openFrom: 9 * 60, payAtClub: true, depositPercent: 30, publicBooking: true }));
    ok(await addTariff(db, admin, id, { label: 'Todo el día', days: 127, fromMinute: 9 * 60, toMinute: 23 * 60, memberPrice: 18_000_00, guestPrice: 24_000_00 }));
  }
  ok(await setBookingRule(db, admin, quincho, { slotMinutes: 240, openFrom: 12 * 60, openTo: 24 * 60, maxAdvanceDays: 60, holdMinutes: 15, cancelHours: 72, depositPercent: 30, payAtClub: true }));
  ok(await addTariff(db, admin, quincho, { label: 'Evento', days: 127, fromMinute: 12 * 60, toMinute: 24 * 60, memberPrice: 35_000_00, guestPrice: 50_000_00 }));

  // Otras ocupaciones de la agenda central (Escuelas, Torneos y Eventos llegan en sus hitos).
  const today = clubDayOf(new Date()).day;
  const day = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const saturday = day((5 - clubDayOf(new Date()).weekday + 7) % 7 || 7); // próximo sábado
  const occupy = async (venueId: string, d: string, from: number, to: number, kind: 'school' | 'tournament' | 'event', label: string) =>
    ok(await placeSlot(db, { venueId, startsAt: clubTime(d, from * 60), endsAt: clubTime(d, to * 60), kind, label, source: 'lab', sourceRef: `${kind}:${venueId}:${d}:${from}`, createdById: admin }));
  for (const d of [day(1), day(2)]) await occupy(p2, d, 9, 11, 'school', 'Escuela de pádel');
  for (const id of [f51, f52]) await occupy(id, saturday, 14, 18, 'tournament', 'Relámpago · fecha 3');
  await occupy(salon, saturday, 18, 24, 'event', 'Peña del rugby');
  await occupy(pileta, day(1), 10, 19, 'school', 'Colonia + uso libre');
  ok(await createBlock(db, admin, { venueId: f51, day: day(1), fromMinute: 9 * 60, toMinute: 12 * 60, reason: 'Mantenimiento del césped' }));

  // Reservas en todos los estados.
  const book = async (who: string, venueId: string, d: string, hour: number, payMode: 'full' | 'deposit' | 'club') =>
    ok(await createBooking(db, padron[who]!, { personId: padron[who]!, venueId, startsAt: clubTime(d, hour * 60), payMode }));
  const paid = await book('Lucas Benítez', p2, saturday, 19, 'deposit');
  ok(await recordPayment(db, admin, { payerPersonId: padron['Lucas Benítez']!, chargeIds: [paid.chargeId!], method: 'transfer' }));
  await db.$transaction((tx) => confirmPaidBookings(tx, [paid.chargeId!]));
  await book('Valentina Rossi', f52, day(1), 20, 'club'); // confirmada, se paga en el club
  await book('Bruno Ferrari', p1, day(1), 19, 'full'); // retenida, esperando el pago
  const cancelled = await book('Camila Torres', quincho, day(10), 20, 'club');
  ok(await cancelBooking(db, padron['Camila Torres']!, cancelled.id, { byManager: false }));

  // Reserva sin cuenta (invitada, seña pagada) y una reserva fija semanal cargada por el encargado.
  const guest = ok(await createPublicBooking(db, { venueId: f51, startsAt: clubTime(day(2), 22 * 60), payMode: 'deposit', guest: { name: 'Martina Ruiz', email: 'martina.ruiz@lab.clumera.app', phone: '+54 9 11 5555 0101' } }));
  ok(await recordPayment(db, admin, { payerPersonId: guest.personId, chargeIds: [guest.chargeId!], method: 'transfer' }));
  await db.$transaction((tx) => confirmPaidBookings(tx, [guest.chargeId!]));
  ok(await createBookingSeries(db, admin, { venueId: p1, personId: padron['Valentina Rossi']!, weekday: 1, startMinute: 22 * 60, fromDay: today, untilDay: day(8 * 7), label: 'Pádel de los martes' }));
}

/**
 * Escuelas de demo: natación infantil (Tomás, el hijo de la socia, en el grupo de martes y jueves;
 * el de los sábados lleno y con lista de espera), escuela de hockey y funcional solo para socios.
 * El profesor de Lab tiene el ámbito «natacion».
 */
async function seedSchools(db: PrismaClient, admin: string): Promise<void> {
  const ok = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };
  const prog = async (input: Parameters<typeof createProgram>[2]) => ok(await createProgram(db, admin, input)).id;
  const group = async (programId: string, name: string, days: number, time: number, capacity: number, place: string, teacherName: string) =>
    ok(await createGroup(db, admin, programId, { name, days, startMinute: time, durationMinutes: 60, capacity, place, teacherName })).id;
  const natacion = await prog({ slug: 'natacion', name: 'Natación infantil', activity: 'natacion', minAge: 6, maxAge: 12, membersOnly: false, memberFee: 1_500_000, guestFee: 2_000_000, description: 'Aprendizaje y técnica' });
  const marJue = await group(natacion, 'Mar y Jue 18', 0b0001010, 18 * 60, 12, 'Pileta cubierta', 'Juan Acosta');
  const sabados = await group(natacion, 'Sábados 10', 0b0100000, 10 * 60, 2, 'Pileta cubierta', 'Juan Acosta');
  const hockey = await prog({ slug: 'escuela-hockey', name: 'Escuela de hockey', activity: 'hockey', minAge: 8, maxAge: 14, membersOnly: false, memberFee: 1_200_000, guestFee: 1_600_000 });
  await group(hockey, 'Sub 12', 0b0000101, 17 * 60, 20, 'Cancha sintética', 'Laura Ríos');
  const funcional = await prog({ slug: 'funcional', name: 'Funcional adultos', activity: 'funcional', minAge: 18, maxAge: null, membersOnly: true, memberFee: 900_000, guestFee: 900_000 });
  await group(funcional, 'Mañana', 0b0010101, 8 * 60, 15, 'Gimnasio', 'Sol Vera');

  const tomas = (await db.person.findFirstOrThrow({ where: { firstName: 'Tomás', lastName: 'Fernández' }, select: { id: true } })).id;
  ok(await enrollInSchool(db, admin, { groupId: marJue, personId: tomas }));
  const kids: string[] = [];
  for (const [firstName, lastName, birth] of [['Emma', 'Díaz', '2016-04-02'], ['Bruno', 'Lagos', '2017-08-19'], ['Pilar', 'Núñez', '2018-01-23']] as const) {
    const id = (await db.person.create({ data: { firstName, lastName, birthDate: new Date(birth) } })).id;
    kids.push(id);
    ok(await enrollInSchool(db, admin, { groupId: sabados, personId: id }));
  }
  ok(await enrollInSchool(db, admin, { groupId: marJue, personId: kids[0]! }));
  // Asistencia de la última clase del grupo de martes y jueves.
  const last = new Date(Date.now() - 3 * 3_600_000);
  while (![1, 3].includes((last.getUTCDay() + 6) % 7)) last.setUTCDate(last.getUTCDate() - 1);
  last.setUTCDate(last.getUTCDate() - 7);
  ok(await markAttendance(db, admin, marJue, last.toISOString().slice(0, 10), [{ personId: tomas, mark: 'present' }, { personId: kids[0]!, mark: 'late' }]));
}

/**
 * Colonia de demo: temporada de enero con grupos por edad, documentos (apto físico —dato de salud—,
 * DNI y autorización de salidas) y 10% de descuento desde el segundo hermano. Sofía Gómez tiene la
 * inscripción pendiente con documentos para revisar y su abuela autorizada a retirarla.
 */
async function seedCamp(db: PrismaClient, padron: Record<string, string>): Promise<void> {
  const ok = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };
  const p = await db.program.create({
    data: {
      slug: 'colonia-verano',
      module: 'summer',
      name: 'Colonia de verano',
      description: 'Enero · lunes a viernes',
      activity: 'colonia',
      minAge: 4,
      maxAge: 12,
      feeKind: 'once',
      memberFee: 8_000_000,
      guestFee: 10_000_000,
      familyDiscountPercent: 10,
      documents: {
        create: [
          { code: 'apto', label: 'Apto físico', sensitive: true, sortOrder: 0 },
          { code: 'dni', label: 'Copia de DNI', sortOrder: 1 },
          { code: 'salidas', label: 'Autorización de salidas', sortOrder: 2 },
        ],
      },
      groups: {
        create: [
          { name: 'G1 · Pequeños (4 a 5)', schedule: 'Lun a Vie 14:00', days: 31, startMinute: 14 * 60, durationMinutes: 240, capacity: 30, place: 'Salón infantil', teacherName: 'Ana Lima' },
          { name: 'G2 · Exploradores (6 a 7)', schedule: 'Lun a Vie 09:00', days: 31, startMinute: 9 * 60, durationMinutes: 240, capacity: 40, place: 'Sintética', teacherName: 'Iñaki Sosa' },
          { name: 'G3 · Aventureros (8 a 10)', schedule: 'Lun a Vie 09:00', days: 31, startMinute: 9 * 60, durationMinutes: 240, capacity: 60, place: 'Cancha 2', teacherName: 'Laura Ríos' },
          { name: 'G4 · Líderes (11 a 12)', schedule: 'Lun a Vie 09:00', days: 31, startMinute: 9 * 60, durationMinutes: 240, capacity: 40, place: 'F5-1 y pileta', teacherName: 'Sol Vera' },
        ],
      },
    },
    include: { groups: true },
  });
  const martina = padron['Martina Gómez']!;
  const sofia = padron['Sofía Gómez']!;
  const g3 = p.groups.find((g) => g.name.startsWith('G3'))!.id;
  const e = ok(await enrollInCamp(db, martina, { groupId: g3, personId: sofia, familyIds: [martina, sofia, padron['Joaquín Gómez']!] }));
  const pdf = new TextEncoder().encode('%PDF-1.4\n% Documento de demo de Clumera Lab\n');
  ok(await submitCampDocument(db, martina, { enrollmentId: e.id, code: 'apto', filename: 'apto-fisico-sofia.pdf', bytes: pdf }));
  ok(await submitCampDocument(db, martina, { enrollmentId: e.id, code: 'dni', filename: 'dni-sofia.pdf', bytes: pdf }));
  await db.enrollment.update({ where: { id: e.id }, data: { imageConsent: true, emergencyName: 'Martina Gómez', emergencyPhone: '1155550101' } });
  // Lab no tiene la clave de documentos del núcleo: la abuela se carga sin DNI (en la app, siempre con DNI).
  const rosa = await db.person.create({ data: { firstName: 'Rosa', lastName: 'Paredes', phone: '1155550199' } });
  await db.pickupAuthorization.create({ data: { minorId: sofia, authorizedPersonId: rosa.id, note: 'abuela' } });
}

/**
 * Accesos de demo: entrada principal y pileta; credenciales válidas (carnets), vencidas (la
 * suspendida), revocadas (Camila perdió el carnet) y de reserva (la de Martina Ruiz, sin cuenta);
 * algunos intentos de hoy validados por Recepción.
 */
/**
 * Torneos (caso D): un relámpago de Fútbol 5 el próximo sábado ya sorteado, con la primera ronda
 * jugada (tabla calculada y página pública), y uno de vóley con la inscripción abierta para que el
 * socio inscriba su equipo. Los equipos sembrados no generan cargos: no cambian Finanzas.
 */
async function seedTournaments(db: PrismaClient, organizer: string): Promise<void> {
  const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
    if (!r.ok) throw r.error;
    return r.value;
  };
  const now = clubDayOf(new Date());
  const saturday = new Date(Date.parse(`${now.day}T12:00:00Z`) + ((5 - now.weekday + 7) % 7 || 7) * 86_400_000).toISOString().slice(0, 10);
  const inTwoWeeks = new Date(Date.parse(`${saturday}T12:00:00Z`) + 14 * 86_400_000).toISOString().slice(0, 10);
  const relampago = ok(await createTournament(db, organizer, { slug: 'relampago-verano', name: 'Relámpago de Verano', sportCode: 'football_5', description: 'Fútbol 5 mixto, un sábado de 14 a 18', maxTeams: 8, zoneCount: 2, qualifiersPerZone: 2, entryFee: 0, playDay: saturday, firstMatchMinute: 14 * 60, matchMinutes: 30, places: ['F5-1', 'F5-2'] })).id;
  const teams: string[] = [];
  for (const name of ['Rayo FC', 'Los Halcones', 'Atlético 5', 'Los Pibes', 'Deportivo Sur', 'Unión Norte', 'Fénix', 'La Banda']) teams.push(ok(await registerTeam(db, organizer, { tournamentId: relampago, name })).id);
  ok(await drawAndSchedule(db, organizer, relampago, teams));
  const first = await db.tournamentMatch.findMany({ where: { tournamentId: relampago, round: 1 }, orderBy: { slot: 'asc' } });
  const scores: Array<[number, number]> = [[3, 1], [2, 2], [0, 1], [4, 2]];
  for (const [i, m] of first.entries()) ok(await recordResult(db, organizer, m.id, { homeScore: scores[i % 4]![0], awayScore: scores[i % 4]![1] }));

  const voley = ok(await createTournament(db, organizer, { slug: 'voley-primavera', name: 'Vóley de Primavera', sportCode: 'volleyball', maxTeams: 6, zoneCount: 1, qualifiersPerZone: 2, entryFee: 0, playDay: inTwoWeeks, firstMatchMinute: 10 * 60, matchMinutes: 40, places: ['Gimnasio'] })).id;
  for (const name of ['Las Rápidas', 'Bloqueo Total', 'Saque y Red']) ok(await registerTeam(db, organizer, { tournamentId: voley, name }));
  // Desde acá, cada equipo nuevo paga su inscripción (va a Pagos de su capitán).
  await db.tournament.update({ where: { id: voley }, data: { entryFee: 15_000_00 } });
}

async function seedAccess(db: PrismaClient, padron: Record<string, string>): Promise<void> {
  const main = await db.accessPoint.create({ data: { slug: 'principal', name: 'Acceso principal', sortOrder: 0 } });
  await db.accessPoint.create({ data: { slug: 'pileta', name: 'Pileta', sortOrder: 1 } });
  const creds = createCredentialService(db);
  for (const name of ['Martina Gómez', 'Lucas Benítez', 'Valentina Rossi', 'Camila Torres', 'Julieta Méndez']) await creds.memberCard(padron[name]!);
  const lost = await db.credential.findFirstOrThrow({ where: { personId: padron['Camila Torres']!, kind: 'member_card' } });
  await creds.revoke(lost.id, 'Carnet extraviado');
  const guest = await db.booking.findFirst({ where: { public: true, status: 'confirmed' }, include: { venue: { select: { name: true } } } });
  if (guest) {
    const at = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).format(guest.startsAt).replace(',', '');
    await creds.issueBookingCredential({ bookingId: guest.id, personId: guest.personId, validFrom: new Date(guest.startsAt.getTime() - 30 * 60_000), validTo: guest.endsAt, label: `Reserva ${guest.venue.name} · ${at}` });
  }
  const rosa = await db.userAccount.findUnique({ where: { login: 'recepcion@lab.clumera.app' }, select: { personId: true } });
  if (!rosa) return;
  for (const name of ['Lucas Benítez', 'Valentina Rossi', 'Julieta Méndez', 'Camila Torres']) await checkAccess(db, creds, rosa.personId, { pointId: main.id, personId: padron[name]! });
}

export async function wipeLab(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<Array<{ name: string }>>`
    SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (!tables.length) return;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.name.replace(/"/g, '')}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
