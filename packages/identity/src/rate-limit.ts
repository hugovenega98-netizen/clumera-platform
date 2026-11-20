import type { PrismaClient } from '@clumera/db';
import { sha256 } from './crypto';

export interface RateRule {
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_RULES = {
  loginByIp: { name: 'login-ip', limit: 30, windowSeconds: 15 * 60 },
  loginByAccount: { name: 'login-acct', limit: 10, windowSeconds: 15 * 60 },
  resetRequestByIp: { name: 'reset-ip', limit: 5, windowSeconds: 60 * 60 },
  resetRequestByLogin: { name: 'reset-login', limit: 3, windowSeconds: 60 * 60 },
  tokenUseByIp: { name: 'token-ip', limit: 20, windowSeconds: 15 * 60 },
  pushTestByAccount: { name: 'push-test', limit: 5, windowSeconds: 10 * 60 },
  /** Reserva pública sin cuenta: por IP y por email, para que nadie acapare turnos retenidos. */
  publicBookingByIp: { name: 'pub-book-ip', limit: 10, windowSeconds: 60 * 60 },
  publicBookingByEmail: { name: 'pub-book-mail', limit: 4, windowSeconds: 60 * 60 },
  /** Acciones con el enlace de la reserva (pagar, cancelar). */
  publicBookingLinkByIp: { name: 'pub-link-ip', limit: 30, windowSeconds: 15 * 60 },
  /** El QR de la reserva se renueva cada 30 s: ~30 pedidos por página abierta cada 15 min. */
  publicBookingQrByIp: { name: 'pub-qr-ip', limit: 150, windowSeconds: 15 * 60 },
  /** Recepción busca personas por nombre o documento: tope por cuenta. */
  accessSearchByAccount: { name: 'access-search', limit: 120, windowSeconds: 10 * 60 },
} satisfies Record<string, RateRule>;

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Ventana fija en PostgreSQL: un upsert atómico por solicitud. Funciona entre instancias
 * serverless sin Redis. La clave usa el hash del sujeto (IP o login), nunca el valor en claro.
 */
export async function hitRateLimit(db: PrismaClient, rule: RateRule, subject: string, now = new Date()): Promise<RateResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const expiresAt = new Date(windowStart + windowMs);
  const key = `${rule.name}:${sha256(subject).slice(0, 32)}:${windowStart}`;
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
  };
}

export async function purgeExpiredRateLimits(db: PrismaClient, now = new Date()): Promise<number> {
  return (await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } })).count;
}
