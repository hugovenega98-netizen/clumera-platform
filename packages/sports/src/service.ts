/**
 * Deportes sobre la base: equipos, planteles, partidos, convocatorias, mesa de control, ausencias y
 * rendimiento. La autorización la hace la app con can() y los ámbitos de `scopesOf()`; acá se
 * validan las reglas del deporte y del partido.
 */
import { appendOutbox, type Prisma, type PrismaClient } from '@clumera/db';
import { createEvent, DomainError, type Result, type Scope } from '@clumera/kernel';
import { medicalAvailability } from './health';
import {
  canDeskRecord,
  canRecordSportEvent,
  ClockError,
  clockMinute,
  clockUpdate,
  clockView,
  isMatchLocked,
  matchEventScore,
  playerAvailability,
  requireSport,
  softballState,
  sportEventLabel,
  sportEventPoints,
  usesClock,
  validateSoftballAction,
  validateVolleyballAction,
  volleyballState,
  type ClockAction,
} from './logic';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;
const SLUG = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** Ámbitos de un equipo para can(): deporte y equipo. */
export function scopesOf(team: { slug: string; sport: { slug: string } }): Scope[] {
  return [
    { type: 'sport', id: team.sport.slug },
    { type: 'team', id: team.slug },
  ];
}

// ───────────── Deportes y equipos (administración) ─────────────

export async function createSport(db: PrismaClient, input: { code: string; slug: string; name: string }): Promise<Result<{ id: string }>> {
  try {
    requireSport(input.code);
  } catch {
    return fail('invalid_input', 'Deporte desconocido');
  }
  if (!SLUG.test(input.slug)) return fail('invalid_input', 'Identificador inválido (minúsculas, números y guiones)');
  if (await db.sport.findUnique({ where: { slug: input.slug } })) return fail('conflict', 'Ya existe un deporte con ese identificador');
  const s = await db.sport.create({ data: { code: input.code, slug: input.slug, name: input.name.trim() } });
  return { ok: true, value: { id: s.id } };
}

export async function createTeam(db: PrismaClient, input: { sportId: string; name: string; slug: string; monthlyFee?: number | null }): Promise<Result<{ id: string }>> {
  if (!SLUG.test(input.slug)) return fail('invalid_input', 'Identificador inválido (minúsculas, números y guiones)');
  if (input.monthlyFee != null && (!Number.isSafeInteger(input.monthlyFee) || input.monthlyFee <= 0)) return fail('invalid_input', 'Arancel inválido');
  if (!(await db.sport.findUnique({ where: { id: input.sportId } }))) return fail('not_found', 'Deporte inexistente');
  if (await db.team.findUnique({ where: { slug: input.slug } })) return fail('conflict', 'Ya existe un equipo con ese identificador');
  const t = await db.team.create({ data: { sportId: input.sportId, name: input.name.trim(), slug: input.slug, monthlyFee: input.monthlyFee ?? null } });
  return { ok: true, value: { id: t.id } };
}

export async function setTeamMember(db: PrismaClient, teamId: string, personId: string, active: boolean, number?: number | null): Promise<Result<{ id: string }>> {
  const [team, person] = await Promise.all([db.team.findUnique({ where: { id: teamId } }), db.person.findUnique({ where: { id: personId }, select: { id: true } })]);
  if (!team || !person) return fail('not_found', 'Equipo o persona inexistente');
  if (number != null && (!Number.isInteger(number) || number < 0 || number > 999)) return fail('invalid_input', 'Número inválido');
  const m = await db.teamMember.upsert({
    where: { teamId_personId: { teamId, personId } },
    create: { teamId, personId, active, number: number ?? null },
    update: { active, ...(number !== undefined ? { number } : {}) },
  });
  return { ok: true, value: { id: m.id } };
}

export async function sportsOverview(db: PrismaClient) {
  return db.sport.findMany({
    orderBy: { name: 'asc' },
    include: { teams: { orderBy: { name: 'asc' }, include: { _count: { select: { members: { where: { active: true } } } } } } },
  });
}

// ───────────── Mis deportes ─────────────

export interface MyTeam {
  teamId: string;
  teamName: string;
  teamSlug: string;
  sportName: string;
  sportCode: string;
  sportSlug: string;
  person: { id: string; firstName: string; isSelf: boolean };
  nextMatch: { id: string; opponent: string; startsAt: Date; venue: string; home: boolean; status: string; response: string; inLineup: boolean } | null;
}

/** Equipos donde juega la persona o alguno de sus representados. */
export async function myTeams(db: PrismaClient, personId: string, at = new Date()): Promise<MyTeam[]> {
  const deps = await db.familyRelationship.findMany({ where: { role: 'dependent', group: { members: { some: { personId, role: 'guardian' } } } }, select: { personId: true } });
  const ids = [personId, ...deps.map((d) => d.personId)];
  const rows = await db.teamMember.findMany({
    where: { personId: { in: ids }, active: true, team: { active: true, sport: { active: true } } },
    include: { person: { select: { id: true, firstName: true } }, team: { include: { sport: true } } },
    orderBy: [{ team: { sport: { name: 'asc' } } }, { team: { name: 'asc' } }],
  });
  const result: MyTeam[] = [];
  for (const r of rows) {
    const next = await db.match.findFirst({
      where: { teamId: r.teamId, status: { in: ['scheduled', 'live'] }, startsAt: { gte: new Date(at.getTime() - 4 * 3600_000) } },
      orderBy: { startsAt: 'asc' },
      include: { callups: { where: { personId: r.personId } } },
    });
    result.push({
      teamId: r.teamId,
      teamName: r.team.name,
      teamSlug: r.team.slug,
      sportName: r.team.sport.name,
      sportCode: r.team.sport.code,
      sportSlug: r.team.sport.slug,
      person: { id: r.person.id, firstName: r.person.firstName, isSelf: r.personId === personId },
      nextMatch: next
        ? { id: next.id, opponent: next.opponent, startsAt: next.startsAt, venue: next.venue, home: next.home, status: next.status, response: next.callups[0]?.response ?? 'pending', inLineup: next.callups[0]?.inLineup ?? false }
        : null,
    });
  }
  return result;
}

export async function teamWithSport(db: PrismaClient, teamId: string) {
  return db.team.findUnique({ where: { id: teamId }, include: { sport: true } });
}

/** Partidos de un equipo (próximos y jugados) con el resultado y la respuesta de una persona. */
export async function teamMatches(db: PrismaClient, teamId: string, personId?: string) {
  const matches = await db.match.findMany({
    where: { teamId },
    orderBy: { startsAt: 'desc' },
    take: 40,
    include: personId ? { callups: { where: { personId } } } : undefined,
  });
  return matches;
}

/** Rendimiento de una persona en un equipo: partidos jugados, puntos, incidencias por tipo y asistencia. */
export async function performance(db: PrismaClient, personId: string, teamId: string) {
  const team = await db.team.findUnique({ where: { id: teamId }, include: { sport: true } });
  if (!team) return null;
  const callups = await db.matchCallup.findMany({ where: { personId, match: { teamId, status: { in: ['played', 'pending_close'] } } }, select: { inLineup: true, response: true, matchId: true } });
  const events = await db.matchEvent.findMany({ where: { personId, voidedAt: null, side: 'own', match: { teamId, status: { in: ['played', 'pending_close', 'live'] } } }, select: { type: true } });
  const byType = new Map<string, number>();
  for (const e of events) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  const answered = callups.filter((c) => c.response !== 'pending');
  return {
    sportCode: team.sport.code,
    matches: callups.filter((c) => c.inLineup).length,
    points: events.reduce((s, e) => s + sportEventPoints(team.sport.code, e.type), 0),
    attendance: answered.length ? Math.round((answered.filter((c) => c.response === 'going').length / answered.length) * 100) : null,
    events: [...byType].map(([type, count]) => ({ type, label: sportEventLabel(team.sport.code, type), count })).sort((a, b) => b.count - a.count),
  };
}

// ───────────── Plantel (coach) ─────────────

/** Plantel con disponibilidad para una fecha (ausencias; la salud llega con su módulo). */
export async function roster(db: PrismaClient, teamId: string, date: Date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const [members, absences] = await Promise.all([
    db.teamMember.findMany({ where: { teamId, active: true }, include: { person: { select: { id: true, firstName: true, lastName: true, birthDate: true } } }, orderBy: [{ person: { lastName: 'asc' } }] }),
    db.absence.findMany({ where: { teamId, date: day, cancelledAt: null }, select: { personId: true, reason: true } }),
  ]);
  const absent = new Map(absences.map((a) => [a.personId, a.reason]));
  const medical = await medicalAvailability(db, teamId, members.map((m) => m.personId));
  return members.map((m) => ({
    personId: m.personId,
    firstName: m.person.firstName,
    lastName: m.person.lastName,
    number: m.number,
    availability: playerAvailability(absent.has(m.personId), medical.get(m.personId) ?? null),
    absenceReason: absent.get(m.personId) ?? null,
  }));
}

// ───────────── Partidos ─────────────

export async function createMatch(
  db: PrismaClient,
  actorPersonId: string,
  input: { teamId: string; opponent: string; startsAt: Date; home: boolean; venue?: string },
): Promise<Result<{ id: string }>> {
  if (!input.opponent.trim()) return fail('invalid_input', 'Falta el rival');
  if (Number.isNaN(input.startsAt.getTime())) return fail('invalid_input', 'Fecha inválida');
  const team = await db.team.findUnique({ where: { id: input.teamId } });
  if (!team || !team.active) return fail('not_found', 'Equipo inexistente');
  const members = await db.teamMember.findMany({ where: { teamId: team.id, active: true }, select: { personId: true } });
  const m = await db.$transaction(async (tx) => {
    const match = await tx.match.create({
      data: { teamId: team.id, opponent: input.opponent.trim(), startsAt: input.startsAt, home: input.home, venue: input.venue?.trim() ?? '', createdById: actorPersonId, callups: { create: members.map((x) => ({ personId: x.personId })) } },
    });
    await appendOutbox(tx, createEvent('match.scheduled', 'sports', { matchId: match.id, teamId: team.id, personIds: members.map((x) => x.personId) }));
    return match;
  });
  return { ok: true, value: { id: m.id } };
}

export async function matchDetail(db: PrismaClient, matchId: string) {
  return db.match.findUnique({
    where: { id: matchId },
    include: {
      team: { include: { sport: true } },
      clock: true,
      callups: { include: { person: { select: { id: true, firstName: true, lastName: true } } }, orderBy: [{ person: { lastName: 'asc' } }] },
      events: { where: { voidedAt: null }, orderBy: { createdAt: 'asc' } },
      temporaryPlayers: { orderBy: [{ number: 'asc' }, { name: 'asc' }] },
    },
  });
}

/** Respuesta a la convocatoria (la persona o su responsable). */
export async function respondCallup(db: PrismaClient, matchId: string, personId: string, response: 'going' | 'not_going', note?: string | null): Promise<Result<{ id: string }>> {
  const c = await db.matchCallup.findUnique({ where: { matchId_personId: { matchId, personId } }, include: { match: true } });
  if (!c) return fail('not_found', 'No estás convocado a este partido');
  if (c.match.status !== 'scheduled') return fail('conflict', 'El partido ya empezó o se cerró');
  await db.matchCallup.update({ where: { id: c.id }, data: { response, note: note?.trim().slice(0, 200) || null, respondedAt: new Date(), ...(response === 'not_going' ? { inLineup: false } : {}) } });
  return { ok: true, value: { id: c.id } };
}

/** Formación del partido (coach): solo convocados que no dijeron que no van. */
export async function setLineup(db: PrismaClient, matchId: string, personIds: string[]): Promise<Result<{ count: number }>> {
  const m = await db.match.findUnique({ where: { id: matchId }, include: { callups: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (isMatchLocked(m.status)) return fail('conflict', 'El partido está cerrado');
  const wanted = new Set(personIds);
  const invalid = [...wanted].filter((id) => !m.callups.some((c) => c.personId === id && c.response !== 'not_going'));
  if (invalid.length) return fail('invalid_input', 'Hay personas que no están convocadas o avisaron que no van');
  await db.$transaction(m.callups.map((c) => db.matchCallup.update({ where: { id: c.id }, data: { inLineup: wanted.has(c.personId) } })));
  return { ok: true, value: { count: wanted.size } };
}

/** Pasa el partido a «en juego» (coach o mesa). */
export async function startMatch(db: PrismaClient, matchId: string): Promise<Result<{ id: string }>> {
  const m = await db.match.findUnique({ where: { id: matchId } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (m.status !== 'scheduled') return fail('conflict', 'Solo se inicia un partido programado');
  await db.$transaction(async (tx) => {
    await tx.match.update({ where: { id: m.id }, data: { status: 'live' } });
    await tx.matchClock.upsert({ where: { matchId: m.id }, create: { matchId: m.id }, update: {} });
    await appendOutbox(tx, createEvent('match.started', 'sports', { matchId: m.id, teamId: m.teamId }));
  });
  return { ok: true, value: { id: m.id } };
}

export async function clockAction(db: PrismaClient, matchId: string, action: ClockAction, now = new Date()): Promise<Result<ReturnType<typeof clockView>>> {
  const m = await db.match.findUnique({ where: { id: matchId }, include: { clock: true, team: { include: { sport: true } } } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (m.status !== 'live') return fail('conflict', 'El partido no está en juego');
  try {
    const next = clockUpdate(m.clock, action, now, m.team.sport.code);
    const saved = await db.matchClock.upsert({ where: { matchId }, create: { matchId, ...next }, update: next });
    return { ok: true, value: clockView(saved, now, m.team.sport.code) };
  } catch (e) {
    if (e instanceof ClockError) return fail('conflict', e.message);
    throw e;
  }
}

export interface RecordEventInput {
  type: string;
  side: 'own' | 'opponent';
  personId?: string | null;
  temporaryPlayerId?: string | null;
  opponentPlayer?: string | null;
}

/** Incidencia desde la mesa: solo en juego, tipos del deporte, jugador en la formación. */
export async function recordEvent(db: PrismaClient, matchId: string, actorPersonId: string, input: RecordEventInput, now = new Date()): Promise<Result<{ id: string; score: { own: number; opponent: number } }>> {
  const m = await db.match.findUnique({ where: { id: matchId }, include: { clock: true, team: { include: { sport: true } }, events: { where: { voidedAt: null } }, callups: { where: { inLineup: true } }, temporaryPlayers: { select: { id: true } } } });
  if (!m) return fail('not_found', 'Partido inexistente');
  const code = m.team.sport.code;
  if (input.side === 'own' && input.temporaryPlayerId && !m.temporaryPlayers.some((t) => t.id === input.temporaryPlayerId)) return fail('invalid_input', 'El jugador no está en la planilla de este partido');
  if (!canDeskRecord(m.status, m.clock?.phase)) return fail('conflict', 'La Mesa de control está cerrada: no se pueden agregar incidencias');
  if (!canRecordSportEvent(code, input.type)) return fail('invalid_input', 'Incidencia inválida para este deporte');
  if (input.side !== 'own' && input.side !== 'opponent') return fail('invalid_input', 'Equipo inválido');
  if (input.side === 'own' && input.personId && !m.callups.some((c) => c.personId === input.personId)) return fail('invalid_input', 'La persona no está en la formación del partido');
  let setNumber: number | null = null;
  try {
    if (code === 'volleyball') setNumber = validateVolleyballAction(volleyballState(m.events), input.type, input.side);
    if (code === 'softball') setNumber = validateSoftballAction(softballState(m.events, { home: m.home }), input.type, input.side);
  } catch (e) {
    return fail('conflict', (e as Error).message);
  }
  if (usesClock(code) && (!m.clock || m.clock.phase === 'not_started')) return fail('conflict', 'Iniciá el reloj antes de cargar incidencias');
  const event = await db.$transaction(async (tx) => {
    const created = await tx.matchEvent.create({
    data: {
      matchId,
      type: input.type,
      side: input.side,
      personId: input.side === 'own' && !input.temporaryPlayerId ? (input.personId ?? null) : null,
      temporaryPlayerId: input.side === 'own' ? (input.temporaryPlayerId ?? null) : null,
      opponentPlayer: input.side === 'opponent' ? input.opponentPlayer?.trim().slice(0, 100) || null : null,
      minute: usesClock(code) ? clockMinute(m.clock, now, code) : null,
      setNumber,
      createdById: actorPersonId,
    },
    });
    // Para los avisos por incidencia (la mesa nunca registra lesiones).
    await appendOutbox(tx, createEvent('match.event_recorded', 'sports', { matchId, eventId: created.id }));
    return created;
  });
  const score = matchEventScore([...m.events, event], code, m.home);
  return { ok: true, value: { id: event.id, score } };
}

/** Deshacer la última carga equivocada (queda anulada, no se borra). */
export async function voidEvent(db: PrismaClient, eventId: string): Promise<Result<{ id: string }>> {
  const e = await db.matchEvent.findUnique({ where: { id: eventId }, include: { match: { include: { clock: true } } } });
  if (!e || e.voidedAt) return fail('not_found', 'Incidencia inexistente');
  if (!canDeskRecord(e.match.status, e.match.clock?.phase)) return fail('conflict', 'La Mesa de control está cerrada');
  await db.matchEvent.update({ where: { id: e.id }, data: { voidedAt: new Date() } });
  return { ok: true, value: { id: e.id } };
}

/** Silbato final de la mesa: guarda el marcador calculado y deja el partido para que el coach lo cierre. */
export async function finishMatch(db: PrismaClient, matchId: string): Promise<Result<{ scoreFor: number; scoreAgainst: number }>> {
  const m = await db.match.findUnique({ where: { id: matchId }, include: { clock: true, team: { include: { sport: true } }, events: { where: { voidedAt: null } } } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (m.status !== 'live') return fail('conflict', 'El partido no está en juego');
  if (usesClock(m.team.sport.code) && m.clock?.phase !== 'finished' && m.clock?.phase !== 'not_started') return fail('conflict', 'Terminá el reloj antes del final');
  const score = matchEventScore(m.events, m.team.sport.code, m.home);
  await db.$transaction(async (tx) => {
    await tx.match.update({ where: { id: m.id }, data: { status: 'pending_close', scoreFor: score.own, scoreAgainst: score.opponent } });
    await appendOutbox(tx, createEvent('match.finished', 'sports', { matchId: m.id, teamId: m.teamId, scoreFor: score.own, scoreAgainst: score.opponent }));
  });
  return { ok: true, value: { scoreFor: score.own, scoreAgainst: score.opponent } };
}

/** Cierre oficial del coach: «jugado» (puede corregir el marcador) o «suspendido». */
export async function closeMatch(db: PrismaClient, matchId: string, input: { status: 'played' | 'cancelled'; scoreFor?: number; scoreAgainst?: number }): Promise<Result<{ id: string }>> {
  const m = await db.match.findUnique({ where: { id: matchId }, include: { clock: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (isMatchLocked(m.status)) return fail('conflict', 'Este partido ya está cerrado');
  if (input.status === 'played') {
    if (m.status === 'scheduled') return fail('conflict', 'El partido todavía no se jugó');
    if (m.status === 'live' && m.clock && !['not_started', 'finished'].includes(m.clock.phase)) return fail('conflict', 'El cronómetro está activo: la mesa debe terminar antes del cierre oficial');
    for (const v of [input.scoreFor, input.scoreAgainst]) if (v != null && (!Number.isInteger(v) || v < 0 || v > 999)) return fail('invalid_input', 'Marcador inválido');
  }
  await db.match.update({
    where: { id: m.id },
    data: { status: input.status, ...(input.status === 'played' ? { scoreFor: input.scoreFor ?? m.scoreFor ?? 0, scoreAgainst: input.scoreAgainst ?? m.scoreAgainst ?? 0 } : {}) },
  });
  return { ok: true, value: { id: m.id } };
}

export async function setMatchPublic(db: PrismaClient, matchId: string, mamPublic: boolean): Promise<Result<{ id: string }>> {
  const m = await db.match.findUnique({ where: { id: matchId } });
  if (!m) return fail('not_found', 'Partido inexistente');
  await db.match.update({ where: { id: m.id }, data: { mamPublic } });
  return { ok: true, value: { id: m.id } };
}

/** Minuto a minuto: marcador, reloj y cronología sin datos personales más allá del nombre. */
export async function liveView(db: PrismaClient | Prisma.TransactionClient, matchId: string, now = new Date()) {
  const m = await db.match.findUnique({
    where: { id: matchId },
    include: {
      team: { include: { sport: true } },
      clock: true,
      events: { where: { voidedAt: null }, orderBy: { createdAt: 'desc' }, take: 200, include: { temporaryPlayer: { select: { name: true, number: true } } } },
      substitutions: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!m) return null;
  const code = m.team.sport.code;
  const names = new Map(
    (
      await db.person.findMany({
        where: { id: { in: [...m.events.map((e) => e.personId), ...m.substitutions.flatMap((x) => [x.inPersonId, x.outPersonId])].filter((x): x is string => Boolean(x)) } },
        select: { id: true, firstName: true, lastName: true },
      })
    ).map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
  );
  const calc = matchEventScore(m.events, code, m.home);
  const locked = isMatchLocked(m.status);
  return {
    id: m.id,
    sportCode: code,
    sportName: m.team.sport.name,
    teamName: m.team.name,
    opponent: m.opponent,
    home: m.home,
    venue: m.venue,
    startsAt: m.startsAt,
    status: m.status,
    mamPublic: m.mamPublic,
    streamVideoId: m.streamVideoId,
    score: locked || m.status === 'pending_close' ? { own: m.scoreFor ?? calc.own, opponent: m.scoreAgainst ?? calc.opponent } : calc,
    clock: usesClock(code) ? clockView(m.clock, now, code) : null,
    volley: code === 'volleyball' ? volleyballState(m.events) : null,
    softball: code === 'softball' ? softballState(m.events, { home: m.home }) : null,
    events: [
      ...m.events.map((e) => ({
        id: e.id,
        at: e.createdAt.getTime(),
        side: e.side,
        type: e.type,
        label: sportEventLabel(code, e.type),
        minute: e.minute,
        setNumber: e.setNumber,
        points: sportEventPoints(code, e.type),
        player:
          e.side === 'opponent'
            ? (e.opponentPlayer ?? '')
            : e.temporaryPlayer
              ? `${e.temporaryPlayer.name}${e.temporaryPlayer.number != null ? ` (${e.temporaryPlayer.number})` : ''}`
              : e.personId
                ? (names.get(e.personId) ?? '')
                : '',
      })),
      ...m.substitutions.map((x) => ({
        id: `sub-${x.id}`,
        at: x.createdAt.getTime(),
        side: 'own' as const,
        type: 'substitution',
        label: 'Cambio',
        minute: x.minute,
        setNumber: null,
        points: 0,
        player: `entra ${names.get(x.inPersonId) ?? ''}, sale ${names.get(x.outPersonId) ?? ''}`,
      })),
    ]
      .sort((a, b) => b.at - a.at)
      .map(({ at: _at, ...rest }) => rest),
  };
}

// ───────────── Ausencias ─────────────

export async function reportAbsence(db: PrismaClient, actorPersonId: string, input: { personId: string; teamId: string; date: Date; reason: string }): Promise<Result<{ id: string }>> {
  if (input.reason.trim().length < 3) return fail('invalid_input', 'Contá brevemente el motivo');
  const member = await db.teamMember.findUnique({ where: { teamId_personId: { teamId: input.teamId, personId: input.personId } } });
  if (!member?.active) return fail('not_found', 'No forma parte de ese equipo');
  const date = new Date(Date.UTC(input.date.getUTCFullYear(), input.date.getUTCMonth(), input.date.getUTCDate()));
  const a = await db.absence.upsert({
    where: { personId_teamId_date: { personId: input.personId, teamId: input.teamId, date } },
    create: { personId: input.personId, teamId: input.teamId, date, reason: input.reason.trim().slice(0, 200), createdById: actorPersonId },
    update: { reason: input.reason.trim().slice(0, 200), cancelledAt: null, createdById: actorPersonId },
  });
  // Avisar una ausencia el día de un partido responde la convocatoria.
  const next = new Date(date.getTime() + 86_400_000);
  await db.matchCallup.updateMany({ where: { personId: input.personId, match: { teamId: input.teamId, status: 'scheduled', startsAt: { gte: date, lt: next } } }, data: { response: 'not_going', inLineup: false, respondedAt: new Date(), note: input.reason.trim().slice(0, 200) } });
  return { ok: true, value: { id: a.id } };
}

export async function absencesOf(db: PrismaClient, personIds: string[], from: Date) {
  return db.absence.findMany({ where: { personId: { in: personIds }, cancelledAt: null, date: { gte: from } }, include: { team: true, person: { select: { firstName: true } } }, orderBy: { date: 'asc' } });
}

export async function cancelAbsence(db: PrismaClient, absenceId: string): Promise<Result<{ id: string }>> {
  const a = await db.absence.findUnique({ where: { id: absenceId } });
  if (!a || a.cancelledAt) return fail('not_found', 'Ausencia inexistente');
  await db.absence.update({ where: { id: a.id }, data: { cancelledAt: new Date() } });
  return { ok: true, value: { id: a.id } };
}

// ───────────── Aranceles ─────────────

/** Cargos de arancel del período: uno por jugador activo de cada equipo con arancel. */
export async function teamFeeRows(db: PrismaClient, period: string) {
  const members = await db.teamMember.findMany({ where: { active: true, team: { active: true, monthlyFee: { not: null }, sport: { active: true } } }, include: { team: { include: { sport: true } } } });
  return members.map((m) => ({
    personId: m.personId,
    groupLabel: `${m.team.sport.name} · ${m.team.name}`,
    amount: m.team.monthlyFee!,
    sourceRef: `arancel:${m.teamId}:${m.personId}:${period}`,
  }));
}
