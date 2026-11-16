import { sessionCookieName, sessionCookieOptions } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { guardedDb, labAuth, sameOrigin } from '@/lab';
import { LAB_PROFILES } from '@/profiles';

const secure = process.env.NODE_ENV === 'production';

/** Abre una sesión real del core como el perfil elegido. Existe solo en Lab. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: { code: 'forbidden', message: 'Origen no permitido' } }, { status: 403 });
  const form = await request.formData();
  const profile = LAB_PROFILES.find((p) => p.key === form.get('profile'));
  const back = (error: string) => NextResponse.redirect(new URL(`/lab?error=${encodeURIComponent(error)}`, request.url), 303);
  if (!profile) return back('Perfil desconocido');
  const db = await guardedDb();
  const account = await db.userAccount.findUnique({ where: { login: profile.login } });
  if (!account) return back('El perfil no existe: restaurá los datos base.');
  const session = await labAuth().issueSessionForAccount(account, { userAgent: request.headers.get('user-agent') });
  const res = NextResponse.redirect(new URL('/', request.url), 303);
  res.cookies.set(sessionCookieName(secure), session.token, sessionCookieOptions(secure, session.expiresAt));
  return res;
}
