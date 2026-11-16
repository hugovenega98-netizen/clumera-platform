import 'server-only';
import type { IssuedSession } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { sessionCookieOptions, SESSION_COOKIE } from './session';

export function meta(request: Request) {
  return { userAgent: request.headers.get('user-agent'), requestId: request.headers.get('x-vercel-id') };
}

/** Respuesta con la cookie de sesión. El token nunca viaja en el cuerpo. */
export function withSession(session: IssuedSession, body: Record<string, unknown> = { ok: true }) {
  const res = NextResponse.json(body);
  res.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
  return res;
}

export { safeNext } from './safe-next';
