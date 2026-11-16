/**
 * Cookie de sesión compartida por el core y Lab (mismo origen).
 * `__Host-` obliga a Secure, Path=/ y sin Domain: la cookie no sale del origen del club.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-clumera_session' : 'clumera_session';
}

export function sessionCookieOptions(secure: boolean, expires: Date) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', expires };
}
