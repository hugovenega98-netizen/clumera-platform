import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { confirmPaidTeams, createTournament, drawAndSchedule, generateKnockout, recordResult, registerTeam, tournamentView, withdrawTeam } from '../src';

const url = testDatabaseUrl('tournaments');
const db = url ? createPrismaClient(url) : null;
const NAMES = ['Rayo FC', 'Los Halcones', 'Atlético 5', 'Los Pibes', 'Deportivo Sur', 'Unión Norte', 'Fénix', 'La Banda'];

describe.skipIf(!db)('Torneos: caso D — relámpago de la inscripción a la tabla final', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  let tid = '';
  let org = '';
  const captains: string[] = [];

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "TournamentMatch","TournamentTeam","Tournament","Person","Charge","OutboxEvent","AuditLog","AgendaSlot","Venue" CASCADE');
    org = (await prisma.person.create({ data: { firstName: 'Vera', lastName: 'Org' } })).id;
    captains.length = 0;
    for (const n of NAMES) captains.push((await prisma.person.create({ data: { firstName: n.split(' ')[0]!, lastName: 'Capitán' } })).id);
    const r = await createTournament(prisma, org, { slug: 'relampago', name: 'Relámpago de Verano', sportCode: 'football_5', maxTeams: 8, zoneCount: 2, qualifiersPerZone: 2, entryFee: 2_000_000, playDay: '2026-11-28', firstMatchMinute: 14 * 60, matchMinutes: 30, places: ['F5-1', 'F5-2'] });
    tid = r.ok ? r.value.id : '';
  });

  const registerAll = async () => {
    const ids: string[] = [];
    for (const [i, n] of NAMES.entries()) {
      const r = await registerTeam(prisma, captains[i]!, { tournamentId: tid, name: n });
      if (!r.ok) throw r.error;
      ids.push(r.value.id);
    }
    return ids;
  };

  it('valida la configuración', async () => {
    expect(await createTournament(prisma, org, { slug: 'x', name: 'Malo', sportCode: 'football_5', maxTeams: 8, zoneCount: 2, qualifiersPerZone: 3, entryFee: 0, playDay: '2026-11-28', firstMatchMinute: 600, matchMinutes: 30, places: ['F5-1'] })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    expect(await createTournament(prisma, org, { slug: 'y', name: 'Deporte raro', sportCode: 'quidditch', maxTeams: 8, zoneCount: 2, qualifiersPerZone: 2, entryFee: 0, playDay: '2026-11-28', firstMatchMinute: 600, matchMinutes: 30, places: ['F5-1'] })).toMatchObject({ ok: false });
  });

  it('inscripción: cupo, nombre único, cargo al capitán, pago confirma y baja anula', async () => {
    const ids = await registerAll();
    expect(await registerTeam(prisma, org, { tournamentId: tid, name: 'Noveno' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    const c = await prisma.charge.findFirstOrThrow({ where: { sourceRef: ids[0]! } });
    expect(c).toMatchObject({ personId: captains[0], concept: 'torneo', amount: 2_000_000, description: 'Inscripción Relámpago de Verano · Rayo FC' });
    expect(await confirmPaidTeams(prisma, [c.id])).toBe(1);
    await withdrawTeam(prisma, org, ids[7]!);
    expect(await prisma.charge.findFirstOrThrow({ where: { sourceRef: ids[7]! } })).toMatchObject({ status: 'cancelled' });
    expect(await registerTeam(prisma, org, { tournamentId: tid, name: 'rayo fc' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('caso D: sorteo, fixture sin choques, tabla, semis, final y campeón', async () => {
    const ids = await registerAll();
    const d = await drawAndSchedule(prisma, org, tid, ids);
    expect(d).toMatchObject({ ok: true, value: { matches: 12 } });
    expect(await registerTeam(prisma, org, { tournamentId: tid, name: 'Tarde' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    let v = (await tournamentView(prisma, 'relampago'))!;
    expect(v.tournament.status).toBe('groups');
    expect(v.teams.filter((t) => t.zone === 'A').map((t) => t.name)).toEqual(['Rayo FC', 'Los Pibes', 'Deportivo Sur', 'La Banda']);
    // Nadie juega dos partidos a la misma hora y nunca hay más partidos que canchas.
    const byTime = new Map<number, string[]>();
    for (const m of v.matches) byTime.set(m.startsAt.getTime(), [...(byTime.get(m.startsAt.getTime()) ?? []), m.homeTeamId, m.awayTeamId]);
    for (const teams of byTime.values()) {
      expect(new Set(teams).size).toBe(teams.length);
      expect(teams.length).toBeLessThanOrEqual(4);
    }
    expect(await generateKnockout(prisma, org, tid)).toMatchObject({ ok: false, error: { code: 'conflict' } });

    // Resultados: gana siempre el equipo de nombre que aparece antes en la lista.
    const rank = (id: string) => ids.indexOf(id);
    for (const m of v.matches) {
      const homeWins = rank(m.homeTeamId) < rank(m.awayTeamId);
      expect(await recordResult(prisma, org, m.id, { homeScore: homeWins ? 2 : 0, awayScore: homeWins ? 0 : 2 })).toMatchObject({ ok: true });
    }
    v = (await tournamentView(prisma, 'relampago'))!;
    expect(v.tables.map((z) => z.rows.map((r) => [r.name, r.points]))).toEqual([
      [['Rayo FC', 9], ['Los Pibes', 6], ['Deportivo Sur', 3], ['La Banda', 0]],
      [['Los Halcones', 9], ['Atlético 5', 6], ['Unión Norte', 3], ['Fénix', 0]],
    ]);
    // Consistencia: puntos repartidos = 3 por partido sin empate; goles a favor = goles en contra.
    const all = v.tables.flatMap((z) => z.rows);
    expect(all.reduce((n, r) => n + r.points, 0)).toBe(12 * 3);
    expect(all.reduce((n, r) => n + r.goalsFor, 0)).toBe(all.reduce((n, r) => n + r.goalsAgainst, 0));

    // Corrección oficial: pide motivo; la tabla se recalcula.
    const m0 = v.matches.find((m) => m.home === 'Rayo FC' && m.away === 'Los Pibes') ?? v.matches.find((m) => m.home === 'Los Pibes' && m.away === 'Rayo FC')!;
    expect(await recordResult(prisma, org, m0.id, { homeScore: 1, awayScore: 1 })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    // Error de planilla: el partido lo ganó Los Pibes 2 a 1; pasan a ser primeros de la zona.
    const pibesHome = m0.home === 'Los Pibes';
    expect(await recordResult(prisma, org, m0.id, { homeScore: pibesHome ? 2 : 1, awayScore: pibesHome ? 1 : 2, reason: 'Error de planilla' })).toMatchObject({ ok: true });
    v = (await tournamentView(prisma, 'relampago'))!;
    expect(v.tables[0]!.rows.slice(0, 2).map((r) => [r.name, r.points])).toEqual([['Los Pibes', 9], ['Rayo FC', 6]]);
    expect(v.matches.find((m) => m.id === m0.id)!.version).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'tournament.result_corrected' } })).toBe(1);

    // Eliminación: A1 vs B2 y B1 vs A2; un empate en la llave pide quién pasa.
    expect(await generateKnockout(prisma, org, tid)).toMatchObject({ ok: true, value: { matches: 2 } });
    v = (await tournamentView(prisma, 'relampago'))!;
    const semis = v.matches.filter((m) => m.stage === 'semi');
    expect(semis.map((m) => [m.home, m.away])).toEqual([['Los Pibes', 'Atlético 5'], ['Los Halcones', 'Rayo FC']]);
    expect(await recordResult(prisma, org, semis[0]!.id, { homeScore: 1, awayScore: 1 })).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    await recordResult(prisma, org, semis[0]!.id, { homeScore: 1, awayScore: 1, winnerTeamId: semis[0]!.awayTeamId });
    // Con la llave jugándose, la fase de grupos ya no se corrige.
    expect(await recordResult(prisma, org, m0.id, { homeScore: 3, awayScore: 0, reason: 'Otra corrección' })).toMatchObject({ ok: false, error: { code: 'conflict' } });
    await recordResult(prisma, org, semis[1]!.id, { homeScore: 3, awayScore: 1 });
    v = (await tournamentView(prisma, 'relampago'))!;
    const final = v.matches.find((m) => m.stage === 'final')!;
    const third = v.matches.find((m) => m.stage === 'third')!;
    expect([final.home, final.away]).toEqual(['Atlético 5', 'Los Halcones']);
    expect([third.home, third.away]).toEqual(['Los Pibes', 'Rayo FC']);
    await recordResult(prisma, org, third.id, { homeScore: 2, awayScore: 1 });
    await recordResult(prisma, org, final.id, { homeScore: 0, awayScore: 1 });
    v = (await tournamentView(prisma, 'relampago'))!;
    expect(v.tournament.status).toBe('finished');
    expect(v.podium).toEqual({ champion: 'Los Halcones', runnerUp: 'Atlético 5', third: 'Los Pibes' });
  });

  it('corregir un grupo con la llave armada pero sin jugar la anula para regenerarla', async () => {
    const ids = await registerAll();
    await drawAndSchedule(prisma, org, tid, ids);
    let v = (await tournamentView(prisma, 'relampago'))!;
    for (const m of v.matches) await recordResult(prisma, org, m.id, { homeScore: 1, awayScore: 0 });
    await generateKnockout(prisma, org, tid);
    const g = (await tournamentView(prisma, 'relampago'))!.matches.find((m) => m.stage === 'group')!;
    expect(await recordResult(prisma, org, g.id, { homeScore: 0, awayScore: 4, reason: 'Resultado mal cargado' })).toMatchObject({ ok: true, value: { knockoutReset: true } });
    v = (await tournamentView(prisma, 'relampago'))!;
    expect(v.tournament.status).toBe('groups');
    expect(v.matches.some((m) => m.stage !== 'group')).toBe(false);
  });
});
