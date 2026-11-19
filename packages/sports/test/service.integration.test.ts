import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clockAction,
  closeMatch,
  createMatch,
  createSport,
  createTeam,
  finishMatch,
  liveView,
  myTeams,
  performance,
  recordEvent,
  reportAbsence,
  respondCallup,
  roster,
  setLineup,
  setTeamMember,
  startMatch,
  teamFeeRows,
  voidEvent,
} from '../src';

const url = testDatabaseUrl('sports');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('Deportes sobre PostgreSQL', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  const ids: Record<string, string> = {};
  const T0 = new Date('2026-11-21T14:00:00Z');

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Person","Sport","Team","TeamMember","Match","MatchCallup","MatchEvent","MatchClock","Absence","FamilyGroup","FamilyRelationship","OutboxEvent" CASCADE');
    for (const [k, first] of [
      ['ana', 'Ana'],
      ['tomas', 'Tomás'],
      ['martin', 'Martín'],
      ['lucas', 'Lucas'],
    ] as const)
      ids[k] = (await prisma.person.create({ data: { firstName: first, lastName: 'X' } })).id;
    await prisma.familyGroup.create({ data: { name: 'F', members: { create: [{ personId: ids.ana!, role: 'guardian' }, { personId: ids.tomas!, role: 'dependent' }] } } });
    const rugby = (await createSport(prisma, { code: 'rugby_xv', slug: 'rugby', name: 'Rugby' })) as { value: { id: string } };
    const voley = (await createSport(prisma, { code: 'volleyball', slug: 'voley', name: 'Vóley' })) as { value: { id: string } };
    ids.m12 = ((await createTeam(prisma, { sportId: rugby.value.id, name: 'M12', slug: 'rugby-m12', monthlyFee: 15_000_00 })) as { value: { id: string } }).value.id;
    ids.voley = ((await createTeam(prisma, { sportId: voley.value.id, name: 'Mixto', slug: 'voley-mixto' })) as { value: { id: string } }).value.id;
    for (const p of ['tomas', 'lucas']) await setTeamMember(prisma, ids.m12!, ids[p]!, true);
    await setTeamMember(prisma, ids.voley!, ids.ana!, true);
  });

  it('identificadores y deportes válidos', async () => {
    expect(await createSport(prisma, { code: 'cricket', slug: 'cricket', name: 'Cricket' })).toMatchObject({ ok: false });
    expect(await createSport(prisma, { code: 'hockey', slug: 'Hockey Damas', name: 'Hockey' })).toMatchObject({ ok: false });
    expect(await createSport(prisma, { code: 'hockey', slug: 'rugby', name: 'Hockey' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('mis deportes: lo propio y lo del hijo, con el próximo partido', async () => {
    await createMatch(prisma, ids.martin!, { teamId: ids.m12!, opponent: 'Club Norte', startsAt: T0, home: true });
    const t = await myTeams(prisma, ids.ana!, new Date('2026-11-19T12:00:00Z'));
    expect(t.map((x) => [x.sportName, x.person.firstName, x.person.isSelf])).toEqual([
      ['Rugby', 'Tomás', false],
      ['Vóley', 'Ana', true],
    ]);
    expect(t[0]!.nextMatch).toMatchObject({ opponent: 'Club Norte', response: 'pending' });
  });

  it('partido de rugby: convocatoria, formación, reloj, incidencias, final y cierre', async () => {
    const m = ((await createMatch(prisma, ids.martin!, { teamId: ids.m12!, opponent: 'Club Norte', startsAt: T0, home: true })) as { value: { id: string } }).value.id;
    expect(await prisma.matchCallup.count({ where: { matchId: m } })).toBe(2);
    expect((await respondCallup(prisma, m, ids.tomas!, 'going')).ok).toBe(true);
    expect(await respondCallup(prisma, m, ids.ana!, 'going')).toMatchObject({ ok: false, error: { code: 'not_found' } });
    await respondCallup(prisma, m, ids.lucas!, 'not_going', 'Viaje');
    expect(await setLineup(prisma, m, [ids.tomas!, ids.lucas!])).toMatchObject({ ok: false });
    expect(await setLineup(prisma, m, [ids.tomas!])).toMatchObject({ ok: true });

    // Sin iniciar, la mesa no carga nada.
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'try', side: 'own', personId: ids.tomas! })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    await startMatch(prisma, m);
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'try', side: 'own', personId: ids.tomas! })).toMatchObject({ ok: false, error: { message: expect.stringContaining('reloj') } });
    const t0 = new Date('2026-11-21T14:00:00Z');
    await clockAction(prisma, m, 'start_first_half', t0);
    const tryEv = await recordEvent(prisma, m, ids.martin!, { type: 'try', side: 'own', personId: ids.tomas! }, new Date('2026-11-21T14:12:30Z'));
    expect(tryEv).toMatchObject({ ok: true, value: { score: { own: 5, opponent: 0 } } });
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'try', side: 'own', personId: ids.lucas! })).toMatchObject({ ok: false });
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'injury_incident', side: 'own' })).toMatchObject({ ok: false });
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'goal', side: 'own' })).toMatchObject({ ok: false });
    const conv = await recordEvent(prisma, m, ids.martin!, { type: 'conversion', side: 'own', personId: ids.tomas! }, new Date('2026-11-21T14:13:00Z'));
    await recordEvent(prisma, m, ids.martin!, { type: 'penalty_goal', side: 'opponent', opponentPlayer: 'N° 10' }, new Date('2026-11-21T14:20:00Z'));
    await voidEvent(prisma, conv.ok ? conv.value.id : '');
    expect((await liveView(prisma, m, new Date('2026-11-21T14:21:00Z')))!).toMatchObject({ score: { own: 5, opponent: 3 }, clock: { phase: 'first_half', minute: 21 } });
    expect((await prisma.matchEvent.findFirstOrThrow({ where: { type: 'try' } })).minute).toBe(12);

    expect(await finishMatch(prisma, m)).toMatchObject({ ok: false, error: { message: expect.stringContaining('reloj') } });
    await clockAction(prisma, m, 'half_time', new Date('2026-11-21T14:40:00Z'));
    await clockAction(prisma, m, 'start_second_half', new Date('2026-11-21T14:50:00Z'));
    await clockAction(prisma, m, 'finish_clock', new Date('2026-11-21T15:30:00Z'));
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'try', side: 'own' })).toMatchObject({ ok: false });
    expect(await finishMatch(prisma, m)).toMatchObject({ ok: true, value: { scoreFor: 5, scoreAgainst: 3 } });
    expect(await closeMatch(prisma, m, { status: 'played' })).toMatchObject({ ok: true });
    expect(await closeMatch(prisma, m, { status: 'cancelled' })).toMatchObject({ ok: false, error: { code: 'conflict' } });

    const perf = await performance(prisma, ids.tomas!, ids.m12!);
    expect(perf).toMatchObject({ matches: 1, points: 5, attendance: 100, events: [{ type: 'try', label: 'Try', count: 1 }] });
    expect(await prisma.outboxEvent.count({ where: { type: { in: ['match.scheduled', 'match.started', 'match.finished'] } } })).toBe(3);
  });

  it('vóley: sin reloj, sets y límites desde la mesa', async () => {
    const m = ((await createMatch(prisma, ids.martin!, { teamId: ids.voley!, opponent: 'Rival', startsAt: T0, home: true })) as { value: { id: string } }).value.id;
    await startMatch(prisma, m);
    expect(await clockAction(prisma, m, 'start_first_half')).toMatchObject({ ok: false, error: { code: 'conflict' } });
    for (let i = 0; i < 25; i++) await recordEvent(prisma, m, ids.martin!, { type: 'volley_point', side: 'own' }, new Date(T0.getTime() + i * 1000));
    const v = (await liveView(prisma, m))!;
    expect(v.volley).toMatchObject({ ownSets: 1, sets: [{ number: 1, own: 25, winner: 'own' }, { number: 2 }] });
    await recordEvent(prisma, m, ids.martin!, { type: 'volley_timeout', side: 'own' });
    await recordEvent(prisma, m, ids.martin!, { type: 'volley_timeout', side: 'own' });
    expect(await recordEvent(prisma, m, ids.martin!, { type: 'volley_timeout', side: 'own' })).toMatchObject({ ok: false, error: { message: expect.stringContaining('tiempos muertos') } });
    expect((await prisma.matchEvent.findFirstOrThrow({ where: { type: 'volley_timeout' } })).setNumber).toBe(2);
  });

  it('ausencia el día del partido: responde la convocatoria y figura en el plantel', async () => {
    const m = ((await createMatch(prisma, ids.martin!, { teamId: ids.m12!, opponent: 'Club Norte', startsAt: T0, home: true })) as { value: { id: string } }).value.id;
    expect(await reportAbsence(prisma, ids.ana!, { personId: ids.tomas!, teamId: ids.m12!, date: new Date('2026-11-21'), reason: 'Cumpleaños' })).toMatchObject({ ok: true });
    expect(await prisma.matchCallup.findFirstOrThrow({ where: { matchId: m, personId: ids.tomas! } })).toMatchObject({ response: 'not_going', note: 'Cumpleaños' });
    const r = await roster(prisma, ids.m12!, T0);
    expect(r.find((x) => x.personId === ids.tomas)).toMatchObject({ availability: { code: 'absent' }, absenceReason: 'Cumpleaños' });
    expect(await reportAbsence(prisma, ids.ana!, { personId: ids.ana!, teamId: ids.m12!, date: T0, reason: 'x y z' })).toMatchObject({ ok: false });
  });

  it('aranceles: uno por jugador de equipos con arancel', async () => {
    const rows = await teamFeeRows(prisma, '2026-11');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ groupLabel: 'Rugby · M12', amount: 15_000_00 });
    expect(rows[0]!.sourceRef).toMatch(/^arancel:.+:2026-11$/);
  });
});
