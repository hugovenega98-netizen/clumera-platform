import { redeemGuestCode, signGuestTicket } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { GUEST_COOKIE, guestKey } from '@/lib/guest';
import { clientIp, errorResponse, parseJson, rateLimited } from '@/lib/http';

/** Canje de un código de invitado: cookie firmada para el minuto a minuto de ese partido. */
export async function POST(request: Request) {
  const limited = await rateLimited({ name: 'sports:guest', limit: 10, windowSeconds: 600 }, clientIp(request));
  if (limited) return limited;
  const body = await parseJson(request, z.object({ matchId: z.string().min(1).max(64), code: z.string().min(4).max(40) }));
  if (!body.ok) return body.response;
  const key = guestKey();
  if (!key) return errorResponse('unavailable', 'Los pases de invitado no están configurados', 503);
  const pass = await redeemGuestCode(getPrisma(), body.data.matchId, body.data.code, key);
  if (!pass) return errorResponse('invalid_code', 'El código no es válido para este partido o ya venció', 400);
  const ticket = signGuestTicket(pass.passId, key, pass.expiresAt);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(GUEST_COOKIE, ticket, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 12 * 3600 });
  return res;
}
