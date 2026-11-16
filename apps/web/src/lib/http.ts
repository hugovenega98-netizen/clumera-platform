import 'server-only';
import type { DomainError } from '@clumera/kernel';
import { hitRateLimit, type RateRule } from '@clumera/identity';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { getPrisma } from './db';

export function errorResponse(code: string, message: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}

export function domainErrorResponse(error: DomainError) {
  const res = NextResponse.json(error.toJSON(), { status: error.httpStatus });
  const retry = error.details?.retryAfterSeconds;
  if (typeof retry === 'number') res.headers.set('retry-after', String(retry));
  return res;
}

/** IP del cliente según el proxy de Vercel. Solo se usa hasheada para el límite de solicitudes. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

/** Devuelve una respuesta 429 si se pasó del límite; null si puede seguir. */
export async function rateLimited(rule: RateRule, subject: string): Promise<NextResponse | null> {
  const r = await hitRateLimit(getPrisma(), rule, subject);
  if (r.allowed) return null;
  const res = errorResponse('rate_limited', 'Demasiados intentos. Esperá unos minutos y volvé a probar.', 429);
  res.headers.set('retry-after', String(r.retryAfterSeconds));
  return res;
}

export async function parseJson<T extends z.ZodType>(request: Request, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, response: errorResponse('invalid_input', 'Datos inválidos', 400) };
}
