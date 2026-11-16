import 'server-only';
import { publicOrigin } from '@clumera/config';
import { getPrisma } from '@clumera/db';
import { createAuthService, createCredentialService, DEFAULT_AUTH_SETTINGS, type AuthService, type CredentialService } from '@clumera/identity';
import { mailerFromEnv, type Mailer } from '@clumera/mail';
import { clientConfig } from './client-config';

/** Origen de los enlaces de correo: CLUMERA_PUBLIC_ORIGIN (Lab, previews) o el dominio del club. */
export function appOrigin(): string {
  return (process.env.CLUMERA_PUBLIC_ORIGIN?.trim() || publicOrigin(clientConfig)).replace(/\/+$/, '');
}

let mailer: Mailer | null = null;
export function getMailer(): Mailer {
  mailer ??= mailerFromEnv(process.env as Record<string, string | undefined>, async (m) => {
    await getPrisma().devMailMessage.create({ data: { to: m.to, subject: m.subject, text: m.text, html: m.html ?? null, tag: m.tag ?? null } });
  });
  return mailer;
}

let auth: AuthService | null = null;
export function getAuth(): AuthService {
  auth ??= createAuthService({
    db: getPrisma(),
    mailer: getMailer(),
    settings: { ...DEFAULT_AUTH_SETTINGS, publicOrigin: appOrigin(), clubName: clientConfig.identity.displayName },
  });
  return auth;
}

let credentials: CredentialService | null = null;
export function getCredentials(): CredentialService {
  credentials ??= createCredentialService(getPrisma());
  return credentials;
}
