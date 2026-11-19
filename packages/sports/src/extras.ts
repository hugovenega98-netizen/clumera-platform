/**
 * Alrededor del partido: transmisión, pases de invitado al minuto a minuto, seguidores (avisos por
 * incidencia), planilla transitoria y cambios. Portado del core anterior.
 */
import type { Prisma, PrismaClient } from '@clumera/db';
import { liveView } from './service';
import { DomainError, type Result } from '@clumera/kernel';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { canDeskRecord, clockMinute, usesClock } from './logic';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;

// ───────────── Transmisión ─────────────

/** Acepta un id de YouTube o un enlace (watch, youtu.be, live, embed, shorts). Nunca HTML. */
export function parseYouTubeId(input: string): string | null {
  const v = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return /^\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] ?? null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const q = u.searchParams.get('v');
      if (q && /^[A-Za-z0-9_-]{11}$/.test(q)) return q;
      return /^\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})/.exec(u.pathname)?.[1] ?? null;
    }
  } catch {
    /* no es un enlace */
  }
  return null;
}

export async function setStream(db: PrismaClient, matchId: string, input: string | null): Promise<Result<{ videoId: string | null }>> {
  const videoId = input?.trim() ? parseYouTubeId(input) : null;
  if (input?.trim() && !videoId) return fail('invalid_input', 'Pegá el enlace del video o de la transmisión de YouTube');
  const m = await db.match.findUnique({ where: { id: matchId }, select: { id: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  await db.match.update({ where: { id: matchId }, data: { streamVideoId: videoId } });
  return { ok: true, value: { videoId } };
}

// ───────────── Pases de invitado ─────────────

export const GUEST_SESSION_MS = 12 * 3600_000;
const ENDED = ['pending_close', 'played', 'cancelled'];

function mac(message: string, key: string): string {
  if (!key || key.length < 16) throw new Error('Falta una clave segura para pases de invitado');
  return createHmac('sha256', key).update(`guest-match-v1:${message}`).digest('hex');
}

/** INV-XXXXXXXXXXXXXXXX: 16 caracteres al azar; se muestra una sola vez. */
export function createGuestCode(): string {
  return `INV-${randomBytes(12).toString('base64url').toUpperCase().replace(/_/g, 'A').replace(/-/g, 'B').slice(0, 16)}`;
}
export function normalizeGuestCode(input: string): string | null {
  const v = input.trim().toUpperCase().replace(/\s+/g, '');
  return /^INV-[A-Z0-9]{16}$/.test(v) ? v : null;
}

export async function createGuestPass(db: PrismaClient, matchId: string, actorPersonId: string, key: string, hours = 12): Promise<Result<{ code: string; expiresAt: Date }>> {
  const m = await db.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (ENDED.includes(m.status)) return fail('conflict', 'El partido ya terminó');
  const code = createGuestCode();
  const expiresAt = new Date(Date.now() + Math.min(Math.max(1, hours), 48) * 3600_000);
  await db.matchGuestPass.create({ data: { matchId, codeHash: mac(code, key), codeHint: code.slice(-4), createdById: actorPersonId, expiresAt } });
  return { ok: true, value: { code, expiresAt } };
}

export async function revokeGuestPasses(db: PrismaClient, matchId: string): Promise<number> {
  return (await db.matchGuestPass.updateMany({ where: { matchId, revokedAt: null }, data: { revokedAt: new Date() } })).count;
}

/** Valida un código para un partido: vigente, no revocado y partido no terminado. */
export async function redeemGuestCode(db: PrismaClient, matchId: string, code: string, key: string, now = new Date()): Promise<{ passId: string; expiresAt: Date } | null> {
  const normalized = normalizeGuestCode(code);
  if (!normalized) return null;
  const pass = await db.matchGuestPass.findUnique({ where: { codeHash: mac(normalized, key) }, include: { match: { select: { status: true } } } });
  if (!pass || pass.matchId !== matchId || pass.revokedAt || pass.expiresAt <= now || ENDED.includes(pass.match.status)) return null;
  return { passId: pass.id, expiresAt: pass.expiresAt };
}

/** Ticket firmado para la cookie del invitado (máximo 12 h y nunca más que el pase). */
export function signGuestTicket(passId: string, key: string, expiresAt: Date, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ id: passId, exp: Math.min(expiresAt.getTime(), now + GUEST_SESSION_MS) })).toString('base64url');
  return `${payload}.${mac(payload, key)}`;
}

export function readGuestTicket(value: string | undefined, key: string, now = Date.now()): { passId: string } | null {
  if (!value || value.length > 480) return null;
  const [payload, signature, ...extra] = value.split('.');
  if (extra.length || !payload || !/^[0-9a-f]{64}$/.test(signature ?? '')) return null;
  try {
    const expected = Buffer.from(mac(payload, key), 'hex');
    const given = Buffer.from(signature!, 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { id?: unknown; exp?: unknown };
    if (typeof data.id !== 'string' || typeof data.exp !== 'number' || data.exp <= now || data.exp > now + GUEST_SESSION_MS) return null;
    return { passId: data.id };
  } catch {
    return null;
  }
}

/** El ticket sigue valiendo solo si el pase sigue vigente para ese partido. */
export async function guestTicketAllows(db: PrismaClient, matchId: string, ticket: { passId: string } | null, now = new Date()): Promise<boolean> {
  if (!ticket) return false;
  const pass = await db.matchGuestPass.findUnique({ where: { id: ticket.passId }, include: { match: { select: { status: true } } } });
  return Boolean(pass && pass.matchId === matchId && !pass.revokedAt && pass.expiresAt > now && !ENDED.includes(pass.match.status));
}

// ───────────── Seguidores ─────────────

export async function setFollow(db: PrismaClient, matchId: string, personId: string, follow: boolean): Promise<void> {
  if (follow) await db.matchFollow.upsert({ where: { matchId_personId: { matchId, personId } }, create: { matchId, personId }, update: {} });
  else await db.matchFollow.deleteMany({ where: { matchId, personId } });
}

/** A quién avisar de un partido: convocados (salvo «no voy»), sus responsables y quienes lo siguen. */
export async function matchAudience(db: PrismaClient | Prisma.TransactionClient, matchId: string): Promise<string[]> {
  const [callups, follows] = await Promise.all([
    db.matchCallup.findMany({ where: { matchId, response: { not: 'not_going' } }, select: { personId: true } }),
    db.matchFollow.findMany({ where: { matchId }, select: { personId: true } }),
  ]);
  const players = callups.map((c) => c.personId);
  const guardians = players.length
    ? await db.familyRelationship.findMany({ where: { role: 'guardian', group: { members: { some: { personId: { in: players }, role: 'dependent' } } } }, select: { personId: true } })
    : [];
  return [...new Set([...players, ...guardians.map((g) => g.personId), ...follows.map((f) => f.personId)])];
}

// ───────────── Planilla transitoria y cambios ─────────────

export async function addTemporaryPlayer(db: PrismaClient, matchId: string, input: { name: string; number?: number | null }): Promise<Result<{ id: string }>> {
  const name = input.name.trim().slice(0, 100);
  if (name.length < 2) return fail('invalid_input', 'Indicá el nombre');
  if (input.number != null && (!Number.isInteger(input.number) || input.number < 0 || input.number > 999)) return fail('invalid_input', 'Dorsal inválido');
  const m = await db.match.findUnique({ where: { id: matchId }, select: { status: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (m.status === 'played' || m.status === 'cancelled') return fail('conflict', 'El partido está cerrado');
  if (input.number != null && (await db.matchTemporaryPlayer.findUnique({ where: { matchId_number: { matchId, number: input.number } } }))) return fail('conflict', 'Ese dorsal ya está en la planilla');
  const p = await db.matchTemporaryPlayer.create({ data: { matchId, name, number: input.number ?? null } });
  return { ok: true, value: { id: p.id } };
}

export async function removeTemporaryPlayer(db: PrismaClient, id: string): Promise<Result<{ id: string }>> {
  const p = await db.matchTemporaryPlayer.findUnique({ where: { id }, include: { _count: { select: { events: true } } } });
  if (!p) return fail('not_found', 'Jugador inexistente');
  if (p._count.events) return fail('conflict', 'Tiene incidencias cargadas: no se puede quitar');
  await db.matchTemporaryPlayer.delete({ where: { id } });
  return { ok: true, value: { id } };
}

/** Cambio desde la mesa: sale alguien de la formación, entra un convocado; los dos jugaron. */
export async function recordSubstitution(db: PrismaClient, matchId: string, actorPersonId: string, input: { outPersonId: string; inPersonId: string }, now = new Date()): Promise<Result<{ id: string }>> {
  const m = await db.match.findUnique({ where: { id: matchId }, include: { clock: true, team: { include: { sport: true } }, callups: true } });
  if (!m) return fail('not_found', 'Partido inexistente');
  if (!canDeskRecord(m.status, m.clock?.phase)) return fail('conflict', 'La Mesa de control está cerrada');
  const out = m.callups.find((c) => c.personId === input.outPersonId);
  const inn = m.callups.find((c) => c.personId === input.inPersonId);
  if (!out?.inLineup) return fail('invalid_input', 'Quien sale tiene que estar en la formación');
  if (!inn || inn.response === 'not_going' || inn.inLineup) return fail('invalid_input', 'Quien entra tiene que ser un convocado que todavía no jugó');
  const code = m.team.sport.code;
  const s = await db.$transaction(async (tx) => {
    await tx.matchCallup.update({ where: { id: inn.id }, data: { inLineup: true } });
    return tx.matchSubstitution.create({ data: { matchId, outPersonId: out.personId, inPersonId: inn.personId, minute: usesClock(code) ? clockMinute(m.clock, now, code) : null, createdById: actorPersonId } });
  });
  return { ok: true, value: { id: s.id } };
}

/**
 * Texto del aviso de una incidencia: «Try · Primera 12–7 San Martín · 23'». Sin datos personales
 * sensibles; las lesiones nunca se cargan en la mesa.
 */
export async function eventNotice(db: PrismaClient | Prisma.TransactionClient, matchId: string, eventId: string): Promise<{ title: string; body: string; url: string } | null> {
  const v = await liveView(db, matchId);
  const e = v?.events.find((x) => x.id === eventId);
  if (!v || !e) return null;
  const who = e.side === 'own' ? v.teamName : v.opponent;
  const score = v.home ? `${v.teamName} ${v.score.own}–${v.score.opponent} ${v.opponent}` : `${v.opponent} ${v.score.opponent}–${v.score.own} ${v.teamName}`;
  const when = e.minute != null ? ` · ${e.minute}'` : e.setNumber != null ? ` · set ${e.setNumber}` : '';
  return { title: `${e.label} de ${who}${e.player && e.side === 'own' ? ` (${e.player})` : ''}`, body: `${score}${when}`, url: `/vivo/${matchId}` };
}
