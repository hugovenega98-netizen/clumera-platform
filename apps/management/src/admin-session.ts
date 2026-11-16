/**
 * Acceso a Management: un administrador de Clumera definido por entorno
 * (MANAGEMENT_ADMIN_EMAIL + MANAGEMENT_ADMIN_PASSWORD_HASH con scrypt) y una cookie firmada
 * con HMAC (MANAGEMENT_SESSION_SECRET) que vence a las 12 horas. Sin cuentas en base todavía.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { verifyPassword } from '@clumera/identity';

export const ADMIN_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-clumera_mgmt' : 'clumera_mgmt';
const TTL_MS = 12 * 3_600_000;

function secret(env: Record<string, string | undefined>): string {
  const s = env.MANAGEMENT_SESSION_SECRET ?? '';
  if (s.length < 32) throw new Error('MANAGEMENT_SESSION_SECRET debe tener 32+ caracteres');
  return s;
}

const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

export function issueAdminToken(email: string, env: Record<string, string | undefined> = process.env, now = Date.now()): { token: string; expires: Date } {
  const exp = now + TTL_MS;
  const payload = Buffer.from(JSON.stringify({ email, exp })).toString('base64url');
  return { token: `${payload}.${sign(payload, secret(env))}`, expires: new Date(exp) };
}

export function readAdminToken(token: string | undefined, env: Record<string, string | undefined> = process.env, now = Date.now()): { email: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret(env)));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email: string; exp: number };
    return data.exp > now && data.email === env.MANAGEMENT_ADMIN_EMAIL?.trim().toLowerCase() ? { email: data.email } : null;
  } catch {
    return null;
  }
}

export async function checkAdminCredentials(email: string, password: string, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const adminEmail = env.MANAGEMENT_ADMIN_EMAIL?.trim().toLowerCase();
  const hash = env.MANAGEMENT_ADMIN_PASSWORD_HASH?.trim();
  if (!adminEmail || !hash) return false;
  const passwordOk = await verifyPassword(password, hash);
  return passwordOk && email.trim().toLowerCase() === adminEmail;
}
