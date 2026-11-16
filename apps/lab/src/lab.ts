import 'server-only';
import { publicOrigin, parseClientConfigOrThrow } from '@clumera/config';
import { getPrisma } from '@clumera/db';
import { createAuthService, DEFAULT_AUTH_SETTINGS } from '@clumera/identity';
import { createDevMailer } from '@clumera/mail';
import { assertLabTarget } from './guard';

export const clientConfig = parseClientConfigOrThrow(JSON.parse(process.env.CLUMERA_CLIENT_CONFIG_JSON ?? 'null'));

export function labOrigin(): string {
  return (process.env.CLUMERA_PUBLIC_ORIGIN?.trim() || publicOrigin(clientConfig)).replace(/\/+$/, '');
}

/** Lab siempre usa la bandeja de desarrollo: ningún correo de la demo sale a una persona real. */
export const labMailer = createDevMailer(async (m) => {
  await getPrisma().devMailMessage.create({ data: { to: m.to, subject: m.subject, text: m.text, html: m.html ?? null, tag: m.tag ?? null } });
});

export function labAuth() {
  return createAuthService({
    db: getPrisma(),
    mailer: labMailer,
    settings: { ...DEFAULT_AUTH_SETTINGS, publicOrigin: labOrigin(), clubName: clientConfig.identity.displayName },
  });
}

export async function guardedDb() {
  const db = getPrisma();
  await assertLabTarget(db, process.env, clientConfig.identity.clientId);
  return db;
}

/** Escrituras de Lab solo desde el mismo origen. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
