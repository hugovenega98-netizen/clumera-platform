/**
 * Torneos (lienzo «Torneos · fixture y tabla» y «Página pública del torneo») — caso D del plan: un
 * torneo relámpago corre de la inscripción a la tabla final con resultados consistentes.
 *
 * Inscripción (cargo al capitán en Finanzas) → sorteo en zonas y fixture todos contra todos (con
 * canchas y horarios; ocupa la agenda central) → resultados con las reglas del deporte → tabla
 * calculada → eliminación (semis y final, o final directa) → campeón. Una corrección oficial pide
 * motivo y se audita; la tabla se recalcula sola porque nunca se guarda.
 */
import { clubTime, placeSlot } from '@clumera/agenda';
import type { PrismaClient } from '@clumera/db';
import { appendOutbox } from '@clumera/db';
import { cancelCharge, issueCharge } from '@clumera/finance';
import { createEvent, DomainError, type Result } from '@clumera/kernel';
import { sportDefinition } from '@clumera/sports';
import { randomInt } from 'node:crypto';
import { drawZones, knockoutPairs, pointsRule, roundRobin, standings, zoneName, type StandingRow } from './logic';

const MODULE = 'tournaments';
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;
const lock = (tx: Tx, id: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`tournament:${id}`}, 0))`;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const STAGE_LABEL: Record<string, string> = { group: 'Zona', semi: 'Semifinal', final: 'Final', third: 'Tercer puesto' };
export const STATUS_LABEL: Record<string, string> = { registration: 'Inscripción abierta', groups: 'Fase de grupos', knockout: 'Eliminación', finished: 'Finalizado' };

export interface TournamentInput {
  slug: string;
  name: string;
  sportCode: string;
  description?: string;
  maxTeams: number;
  zoneCount: number;
  qualifiersPerZone: number;
  entryFee: number;
  playDay: string;
  firstMatchMinute: number;
  matchMinutes: number;
  places: string[];
  venueIds?: string[];
}

export async function createTournament(db: PrismaClient, actorPersonId: string, input: TournamentInput): Promise<Result<{ id: string }>> {
  if (!SLUG.test(input.slug)) return fail('invalid_input', 'Usá minúsculas, números y guiones en el identificador');
  if (input.name.trim().length < 3) return fail('invalid_input', 'Escribí el nombre');
  if (!sportDefinition(input.sportCode)) return fail('invalid_input', 'Elegí una modalidad del catálogo de Deportes');
  const q = input.zoneCount * input.qualifiersPerZone;
  if (q !== 2 && q !== 4) return fail('invalid_input', 'Entre todas las zonas tienen que clasificar 2 o 4 equipos');
  if (input.maxTeams < input.zoneCount * 2 || input.maxTeams > 64) return fail('invalid_input', 'Cada zona necesita al menos 2 equipos (hasta 64 en total)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.playDay)) return fail('invalid_input', 'Revisá el día de juego');
  const places = input.places.map((p) => p.trim()).filter(Boolean).slice(0, 8);
  if (!places.length) return fail('invalid_input', 'Indicá al menos una cancha');
  if (await db.tournament.findUnique({ where: { slug: input.slug } })) return fail('conflict', 'Ya existe un torneo con ese identificador');
  const t = await db.tournament.create({ data: { ...input, name: input.name.trim(), description: input.description?.trim() || null, places, venueIds: input.venueIds ?? [], createdById: actorPersonId } });
  await db.auditLog.create({ data: { actorPersonId, action: 'tournament.created', entityType: 'tournament', entityId: t.id, diff: { slug: t.slug } } });
  return { ok: true, value: { id: t.id } };
}

/** Inscribe un equipo (quien inscribe es el capitán y recibe el cargo de la inscripción). */
export async function registerTeam(db: PrismaClient, actorPersonId: string, input: { tournamentId: string; name: string }): Promise<Result<{ id: string; chargeId: string | null; status: 'registered' | 'confirmed' }>> {
  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (name.length < 3) return fail('invalid_input', 'El nombre del equipo tiene que tener al menos 3 letras');
  const t = await db.tournament.findUnique({ where: { id: input.tournamentId } });
  if (!t) return fail('not_found', 'Torneo inexistente');
  if (t.status !== 'registration') return fail('conflict', 'La inscripción está cerrada');
  const r = await db.$transaction(async (tx) => {
    await lock(tx, t.id);
    const count = await tx.tournamentTeam.count({ where: { tournamentId: t.id, status: { not: 'withdrawn' } } });
    if (count >= t.maxTeams) return fail('conflict', 'El torneo ya tiene todos los equipos');
    if (await tx.tournamentTeam.findFirst({ where: { tournamentId: t.id, name: { equals: name, mode: 'insensitive' } } })) return fail('conflict', 'Ya hay un equipo con ese nombre');
    const team = await tx.tournamentTeam.create({ data: { tournamentId: t.id, name, captainId: actorPersonId, status: t.entryFee > 0 ? 'registered' : 'confirmed' } });
    await appendOutbox(tx, createEvent('tournament.team_registered', MODULE, { tournamentId: t.id, teamId: team.id, captainId: actorPersonId }));
    return { ok: true as const, value: team };
  });
  if (!r.ok) return r;
  let chargeId: string | null = null;
  if (t.entryFee > 0) {
    const c = await issueCharge(db, actorPersonId, { personId: actorPersonId, concept: 'torneo', groupLabel: t.name, description: `Inscripción ${t.name} · ${name}`, amount: t.entryFee, dueDate: new Date(`${t.playDay}T00:00:00Z`), source: MODULE, sourceRef: r.value.id });
    if (c.ok) {
      chargeId = c.value.id;
      await db.tournamentTeam.update({ where: { id: r.value.id }, data: { chargeId } });
    }
  }
  return { ok: true, value: { id: r.value.id, chargeId, status: r.value.status as 'registered' | 'confirmed' } };
}

/** Para el consumidor de `payment.approved`: la inscripción paga confirma el equipo. */
export async function confirmPaidTeams(db: PrismaClient | Tx, chargeIds: string[]) {
  const r = await db.tournamentTeam.updateMany({ where: { chargeId: { in: chargeIds }, status: 'registered' }, data: { status: 'confirmed' } });
  return r.count;
}

/** Baja de un equipo (solo con la inscripción abierta). Anula el cargo impago. */
export async function withdrawTeam(db: PrismaClient, actorPersonId: string, teamId: string): Promise<Result<{ id: string }>> {
  const team = await db.tournamentTeam.findUnique({ where: { id: teamId }, include: { tournament: { select: { status: true } } } });
  if (!team || team.status === 'withdrawn') return fail('not_found', 'Equipo inexistente');
  if (team.tournament.status !== 'registration') return fail('conflict', 'El sorteo ya se hizo: no se puede dar de baja');
  await db.tournamentTeam.update({ where: { id: team.id }, data: { status: 'withdrawn' } });
  if (team.chargeId) {
    const c = await db.charge.findUnique({ where: { id: team.chargeId }, select: { status: true, paidAmount: true } });
    if (c?.status === 'pending' && c.paidAmount === 0) await cancelCharge(db, actorPersonId, team.chargeId, 'Baja del torneo');
  }
  await db.auditLog.create({ data: { actorPersonId, action: 'tournament.team_withdrawn', entityType: 'tournament', entityId: team.tournamentId, diff: { teamId: team.id, name: team.name } } });
  return { ok: true, value: { id: team.id } };
}

/** Ordena partidos en horarios: en cada horario, hasta una cancha por partido y nadie juega dos veces. */
function schedule<M extends { homeTeamId: string; awayTeamId: string }>(matches: M[], places: string[], day: string, firstMinute: number, minutes: number) {
  const out: Array<M & { startsAt: Date; place: string }> = [];
  const pending = [...matches];
  let step = 0;
  while (pending.length) {
    const busy = new Set<string>();
    const used: number[] = [];
    for (let i = 0; i < pending.length && used.length < places.length; i++) {
      const m = pending[i]!;
      if (busy.has(m.homeTeamId) || busy.has(m.awayTeamId)) continue;
      busy.add(m.homeTeamId).add(m.awayTeamId);
      out.push({ ...m, startsAt: clubTime(day, firstMinute + step * minutes), place: places[used.length]! });
      used.push(i);
    }
    for (const i of used.reverse()) pending.splice(i, 1);
    step++;
  }
  return out;
}

/**
 * Cierra la inscripción: sortea los equipos en zonas y arma el fixture todos contra todos con
 * horarios y canchas. Si el torneo usa espacios de la agenda central, los ocupa ese día.
 * `order` permite fijar el sorteo (pruebas); si no, es al azar.
 */
export async function drawAndSchedule(db: PrismaClient, actorPersonId: string, tournamentId: string, order?: string[]): Promise<Result<{ matches: number; agendaConflicts: string[] }>> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, include: { teams: { where: { status: { not: 'withdrawn' } }, orderBy: { createdAt: 'asc' } } } });
  if (!t) return fail('not_found', 'Torneo inexistente');
  if (t.status !== 'registration') return fail('conflict', 'El sorteo ya se hizo');
  if (t.teams.length < t.zoneCount * 2) return fail('conflict', `Hacen falta al menos ${t.zoneCount * 2} equipos para sortear`);
  if (t.zoneCount * t.qualifiersPerZone > t.teams.length) return fail('conflict', 'Hay menos equipos que clasificados');
  const teams = [...t.teams];
  if (order) teams.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  else for (let i = teams.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [teams[i], teams[j]] = [teams[j]!, teams[i]!];
  }
  const zones = drawZones(teams, t.zoneCount);
  const rounds: Array<Array<{ zone: string; round: number; homeTeamId: string; awayTeamId: string }>> = [];
  zones.forEach((z, zi) => roundRobin(z.map((x) => x.id)).forEach((pairs, r) => (rounds[r] ??= []).push(...pairs.map(([h, a]) => ({ zone: zoneName(zi), round: r + 1, homeTeamId: h, awayTeamId: a })))));
  const planned = schedule(rounds.flat(), t.places, t.playDay, t.firstMatchMinute, t.matchMinutes);
  await db.$transaction(async (tx) => {
    await lock(tx, t.id);
    for (const [zi, z] of zones.entries()) for (const [si, team] of z.entries()) await tx.tournamentTeam.update({ where: { id: team.id }, data: { zone: zoneName(zi), seed: si + 1 } });
    await tx.tournamentMatch.createMany({ data: planned.map((m, i) => ({ tournamentId: t.id, stage: 'group' as const, zone: m.zone, round: m.round, slot: i + 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, startsAt: m.startsAt, place: m.place })) });
    await tx.tournament.update({ where: { id: t.id }, data: { status: 'groups' } });
    await appendOutbox(tx, createEvent('tournament.fixture_published', MODULE, { tournamentId: t.id, matches: planned.length }));
    await tx.auditLog.create({ data: { actorPersonId, action: 'tournament.drawn', entityType: 'tournament', entityId: t.id, diff: { teams: teams.length, zones: t.zoneCount } } });
  });
  // La agenda central: el día del torneo los espacios quedan tomados (prioridad de torneo).
  const agendaConflicts: string[] = [];
  if (t.venueIds.length && planned.length) {
    const from = new Date(Math.min(...planned.map((m) => m.startsAt.getTime())));
    const to = new Date(Math.max(...planned.map((m) => m.startsAt.getTime())) + t.matchMinutes * 60_000 * 3);
    for (const venueId of t.venueIds) {
      const r = await placeSlot(db, { venueId, startsAt: from, endsAt: to, kind: 'tournament', label: t.name, source: MODULE, sourceRef: `${t.id}:${venueId}`, createdById: actorPersonId });
      if (!r.ok) agendaConflicts.push(r.error.message);
    }
  }
  return { ok: true, value: { matches: planned.length, agendaConflicts } };
}

async function loadMatches(db: PrismaClient | Tx, tournamentId: string) {
  return db.tournamentMatch.findMany({ where: { tournamentId }, orderBy: [{ startsAt: 'asc' }, { slot: 'asc' }] });
}

/** Tabla de cada zona, calculada de los partidos jugados de la fase de grupos. */
export function zoneTables(teams: Array<{ id: string; name: string; zone: string | null }>, matches: Array<{ stage: string; status: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null }>, sportCode: string) {
  const rule = pointsRule(sportCode);
  const zones = [...new Set(teams.flatMap((t) => (t.zone ? [t.zone] : [])))].sort();
  const played = matches.filter((m) => m.stage === 'group' && m.status === 'played') as Array<{ homeTeamId: string; awayTeamId: string; homeScore: number; awayScore: number }>;
  return zones.map((z) => ({ zone: z, rows: standings(teams.filter((t) => t.zone === z), played, rule) }));
}

/** Ganador de un partido jugado (o de la tanda de penales, si empataron). */
const winnerOf = (m: { homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; winnerTeamId: string | null }) =>
  m.homeScore! > m.awayScore! ? m.homeTeamId : m.awayScore! > m.homeScore! ? m.awayTeamId : m.winnerTeamId!;
const loserOf = (m: Parameters<typeof winnerOf>[0]) => (winnerOf(m) === m.homeTeamId ? m.awayTeamId : m.homeTeamId);

/** Con toda la fase de grupos jugada, arma la eliminación con los clasificados de cada zona. */
export async function generateKnockout(db: PrismaClient, actorPersonId: string, tournamentId: string): Promise<Result<{ matches: number }>> {
  const t = await db.tournament.findUnique({ where: { id: tournamentId }, include: { teams: true } });
  if (!t) return fail('not_found', 'Torneo inexistente');
  if (t.status !== 'groups') return fail('conflict', t.status === 'registration' ? 'Primero hacé el sorteo' : 'La eliminación ya está armada');
  const matches = await loadMatches(db, t.id);
  const group = matches.filter((m) => m.stage === 'group');
  if (group.some((m) => m.status !== 'played')) return fail('conflict', 'Faltan resultados de la fase de grupos');
  const tables = zoneTables(t.teams, matches, t.sportCode);
  const pairs = knockoutPairs(tables.map((z) => z.rows.slice(0, t.qualifiersPerZone).map((r) => r.teamId)));
  const stage = pairs.length === 1 ? ('final' as const) : ('semi' as const);
  const lastStart = Math.max(...group.map((m) => m.startsAt.getTime()));
  const start = new Date(lastStart + t.matchMinutes * 60_000);
  const startMinute = (start.getTime() - clubTime(t.playDay, 0).getTime()) / 60_000;
  const planned = schedule(pairs.map(([h, a]) => ({ homeTeamId: h, awayTeamId: a })), t.places, t.playDay, startMinute, t.matchMinutes);
  await db.$transaction(async (tx) => {
    await lock(tx, t.id);
    await tx.tournamentMatch.createMany({ data: planned.map((m, i) => ({ tournamentId: t.id, stage, round: 1, slot: i + 1, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, startsAt: m.startsAt, place: m.place })) });
    await tx.tournament.update({ where: { id: t.id }, data: { status: 'knockout' } });
    await tx.auditLog.create({ data: { actorPersonId, action: 'tournament.knockout_generated', entityType: 'tournament', entityId: t.id, diff: { stage, pairs } } });
  });
  return { ok: true, value: { matches: planned.length } };
}

/**
 * Carga (o corrige) el resultado de un partido. Una corrección pide motivo y queda auditada; la tabla
 * se recalcula sola. Corregir un partido de grupos con la eliminación armada anula la llave si
 * todavía no se jugó (hay que volver a generarla con la tabla corregida); si ya se jugó, no se puede.
 */
export async function recordResult(
  db: PrismaClient,
  actorPersonId: string,
  matchId: string,
  input: { homeScore: number; awayScore: number; winnerTeamId?: string | null; reason?: string },
  now = new Date(),
): Promise<Result<{ id: string; status: string; knockoutReset: boolean }>> {
  if (![input.homeScore, input.awayScore].every((n) => Number.isInteger(n) && n >= 0 && n <= 999)) return fail('invalid_input', 'Revisá el resultado');
  const m = await db.tournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  const t = m.tournament;
  if (t.status === 'registration') return fail('conflict', 'El torneo todavía no empezó');
  const rule = pointsRule(t.sportCode);
  const tie = input.homeScore === input.awayScore;
  const knockout = m.stage !== 'group';
  if (tie && (!rule.draws || knockout)) {
    if (!knockout) return fail('invalid_input', 'En este deporte no hay empate');
    if (input.winnerTeamId !== m.homeTeamId && input.winnerTeamId !== m.awayTeamId) return fail('invalid_input', 'Empate en eliminación: indicá quién pasa (penales)');
  }
  const correction = m.status === 'played';
  const reason = input.reason?.trim().slice(0, 200) ?? '';
  if (correction && reason.length < 5) return fail('invalid_input', 'Una corrección oficial pide el motivo');
  let knockoutReset = false;
  const r = await db.$transaction(async (tx) => {
    await lock(tx, t.id);
    const all = await loadMatches(tx, t.id);
    const ko = all.filter((x) => x.stage !== 'group');
    if (!knockout && correction && ko.length) {
      if (ko.some((x) => x.status === 'played')) return fail('conflict', 'La eliminación ya se está jugando: no se puede corregir la fase de grupos');
      await tx.tournamentMatch.deleteMany({ where: { tournamentId: t.id, stage: { not: 'group' } } });
      await tx.tournament.update({ where: { id: t.id }, data: { status: 'groups' } });
      knockoutReset = true;
    }
    if (knockout && correction) {
      const later = m.stage === 'semi' ? ko.filter((x) => x.stage === 'final' || x.stage === 'third') : [];
      if (later.some((x) => x.status === 'played')) return fail('conflict', 'La final ya se jugó: no se puede corregir la semifinal');
      if (later.length) await tx.tournamentMatch.deleteMany({ where: { id: { in: later.map((x) => x.id) } } });
    }
    const saved = await tx.tournamentMatch.update({
      where: { id: m.id },
      data: { status: 'played', homeScore: input.homeScore, awayScore: input.awayScore, winnerTeamId: knockout && tie ? input.winnerTeamId! : null, version: { increment: 1 }, recordedById: actorPersonId, recordedAt: now },
    });
    await appendOutbox(tx, createEvent('tournament.result_recorded', MODULE, { tournamentId: t.id, matchId: m.id, correction }));
    if (correction) await tx.auditLog.create({ data: { actorPersonId, action: 'tournament.result_corrected', entityType: 'tournament', entityId: t.id, diff: { matchId: m.id, from: [m.homeScore, m.awayScore], to: [input.homeScore, input.awayScore], reason } } });
    // Avance de la llave: con las dos semis jugadas, final y tercer puesto; con la final, el campeón.
    const after = await loadMatches(tx, t.id);
    const semis = after.filter((x) => x.stage === 'semi');
    if (m.stage === 'semi' && semis.length === 2 && semis.every((x) => x.status === 'played') && !after.some((x) => x.stage === 'final')) {
      const [s1, s2] = semis.sort((a, b) => a.slot - b.slot) as [(typeof semis)[0], (typeof semis)[0]];
      const at = new Date(Math.max(s1.startsAt.getTime(), s2.startsAt.getTime()) + t.matchMinutes * 60_000);
      await tx.tournamentMatch.createMany({
        data: [
          { tournamentId: t.id, stage: 'final', round: 2, slot: 1, homeTeamId: winnerOf(s1), awayTeamId: winnerOf(s2), startsAt: at, place: t.places[0]! },
          { tournamentId: t.id, stage: 'third', round: 2, slot: 2, homeTeamId: loserOf(s1), awayTeamId: loserOf(s2), startsAt: at, place: t.places[1] ?? t.places[0]! },
        ],
      });
    }
    const final = after.find((x) => x.stage === 'final');
    await tx.tournament.update({ where: { id: t.id }, data: { status: final?.status === 'played' ? 'finished' : knockoutReset ? 'groups' : t.status === 'finished' ? 'knockout' : t.status } });
    return { ok: true as const, value: { id: saved.id, status: saved.status } };
  });
  if (!r.ok) return r;
  return { ok: true, value: { ...r.value, knockoutReset } };
}

export interface TournamentView {
  tournament: { id: string; slug: string; name: string; sportCode: string; sportLabel: string; description: string | null; status: string; maxTeams: number; zoneCount: number; qualifiersPerZone: number; entryFee: number; playDay: string; places: string[]; publicPage: boolean };
  teams: Array<{ id: string; name: string; zone: string | null; status: string }>;
  matches: Array<{ id: string; stage: string; zone: string | null; round: number; startsAt: Date; place: string; status: string; home: string; away: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; winner: string | null; version: number }>;
  tables: Array<{ zone: string; rows: StandingRow[] }>;
  podium: { champion: string; runnerUp: string; third: string | null } | null;
  rule: ReturnType<typeof pointsRule>;
}

/** Todo lo del torneo para mostrar. Sin datos de personas (apto para la página pública). */
export async function tournamentView(db: PrismaClient, slug: string): Promise<TournamentView | null> {
  const t = await db.tournament.findUnique({ where: { slug }, include: { teams: { where: { status: { not: 'withdrawn' } }, orderBy: [{ zone: 'asc' }, { seed: 'asc' }, { createdAt: 'asc' }] } } });
  if (!t) return null;
  const matches = await loadMatches(db, t.id);
  const name = new Map(t.teams.map((x) => [x.id, x.name]));
  const final = matches.find((m) => m.stage === 'final' && m.status === 'played');
  const third = matches.find((m) => m.stage === 'third' && m.status === 'played');
  return {
    tournament: { id: t.id, slug: t.slug, name: t.name, sportCode: t.sportCode, sportLabel: sportDefinition(t.sportCode)?.label ?? t.sportCode, description: t.description, status: t.status, maxTeams: t.maxTeams, zoneCount: t.zoneCount, qualifiersPerZone: t.qualifiersPerZone, entryFee: t.entryFee, playDay: t.playDay, places: t.places, publicPage: t.publicPage },
    teams: t.teams.map((x) => ({ id: x.id, name: x.name, zone: x.zone, status: x.status })),
    matches: matches.map((m) => ({ id: m.id, stage: m.stage, zone: m.zone, round: m.round, startsAt: m.startsAt, place: m.place, status: m.status, home: name.get(m.homeTeamId) ?? '—', away: name.get(m.awayTeamId) ?? '—', homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, winner: m.status === 'played' ? (name.get(winnerOf(m)) ?? null) : null, version: m.version })),
    tables: zoneTables(t.teams, matches, t.sportCode),
    podium: final ? { champion: name.get(winnerOf(final))!, runnerUp: name.get(loserOf(final))!, third: third ? name.get(winnerOf(third))! : null } : null,
    rule: pointsRule(t.sportCode),
  };
}

export async function listTournaments(db: PrismaClient, onlyPublic = false) {
  return db.tournament.findMany({ where: onlyPublic ? { publicPage: true } : {}, orderBy: [{ playDay: 'desc' }, { name: 'asc' }], include: { _count: { select: { teams: { where: { status: { not: 'withdrawn' } } } } } } });
}

/** Equipos que inscribió una persona (capitán), con el estado de su inscripción. */
export async function captainTeams(db: PrismaClient, personId: string) {
  return db.tournamentTeam.findMany({ where: { captainId: personId, status: { not: 'withdrawn' } }, include: { tournament: { select: { slug: true, name: true, status: true, entryFee: true } } }, orderBy: { createdAt: 'desc' } });
}
