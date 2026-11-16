import 'server-only';
import type { SessionInfo } from '@clumera/identity';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { getAuth } from './services';

const secure = process.env.NODE_ENV === 'production';
/** `__Host-` obliga a Secure, Path=/ y sin Domain: la cookie no sale del origen del club. */
export const SESSION_COOKIE = secure ? '__Host-clumera_session' : 'clumera_session';

export function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', expires };
}

export const getCurrentSession = cache(async (): Promise<SessionInfo | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getAuth().getSession(token);
});

/** Para páginas: sin sesión, al ingreso (y vuelve después a donde iba). */
export async function requireSession(next = '/'): Promise<SessionInfo> {
  const session = await getCurrentSession();
  if (!session) redirect(`/ingresar?next=${encodeURIComponent(next)}`);
  return session;
}
