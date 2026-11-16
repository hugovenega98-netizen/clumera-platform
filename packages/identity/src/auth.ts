/**
 * Autenticación de una instalación:
 * - Cuentas con email o usuario; la cuenta es opcional (una Persona puede no tener login).
 * - Activación y recuperación por enlace de un solo uso (se guarda solo el hash del token).
 * - Sesiones en cookie httpOnly (la app guarda el token; acá solo su hash).
 * - Bloqueo temporal por intentos fallidos. Mensajes genéricos: nunca revelar si una cuenta existe.
 * El documento nunca es contraseña.
 */
import type { Prisma, PrismaClient, UserAccount } from '@clumera/db';
import { DomainError, err, ok, type Result } from '@clumera/kernel';
import { actionEmail, type Mailer } from '@clumera/mail';
import { getDummyHash, hashPassword, randomToken, sha256, verifyPassword } from './crypto';
import { passwordProblems } from './password-policy';

export interface AuthSettings {
  /** Origen público de la instalación, para armar los enlaces de los correos. */
  publicOrigin: string;
  clubName: string;
  sessionTtlDays: number;
  lockThreshold: number;
  lockMinutes: number;
  activationTtlHours: number;
  resetTtlMinutes: number;
}

export const DEFAULT_AUTH_SETTINGS: Omit<AuthSettings, 'publicOrigin' | 'clubName'> = {
  sessionTtlDays: 30,
  lockThreshold: 5,
  lockMinutes: 15,
  activationTtlHours: 72,
  resetTtlMinutes: 60,
};

export interface AuthDeps {
  db: PrismaClient;
  mailer: Mailer;
  settings: AuthSettings;
  now?: () => Date;
}

export interface RequestMeta {
  userAgent?: string | null;
  requestId?: string | null;
}

export interface IssuedSession {
  /** Token en claro: va SOLO a la cookie. */
  token: string;
  expiresAt: Date;
  accountId: string;
  personId: string;
}

export interface SessionInfo {
  sessionId: string;
  accountId: string;
  personId: string;
  login: string;
  firstName: string;
  lastName: string;
  activeContext: string | null;
  expiresAt: Date;
}

export const GENERIC_LOGIN_ERROR = 'Usuario o contraseña incorrectos.';
const LINK_INVALID = 'El enlace no es válido o ya venció. Pedí uno nuevo.';

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

const LOGIN_PATTERN = /^(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|[a-z0-9][a-z0-9._-]{2,39})$/;

export function createAuthService({ db, mailer, settings, now = () => new Date() }: AuthDeps) {
  const audit = (action: string, entityId: string, actorPersonId: string | null, meta?: RequestMeta, diff?: Record<string, unknown>) =>
    db.auditLog.create({ data: { action, entityType: 'UserAccount', entityId, actorPersonId, requestId: meta?.requestId ?? null, diff: diff as Prisma.InputJsonValue | undefined } });

  async function issueSession(account: Pick<UserAccount, 'id' | 'personId'>, meta?: RequestMeta): Promise<IssuedSession> {
    const token = randomToken();
    const expiresAt = new Date(now().getTime() + settings.sessionTtlDays * 86_400_000);
    await db.session.create({
      data: { accountId: account.id, tokenHash: sha256(token), expiresAt, userAgent: meta?.userAgent?.slice(0, 300) ?? null },
    });
    return { token, expiresAt, accountId: account.id, personId: account.personId };
  }

  async function issueLinkToken(accountId: string, purpose: 'activation' | 'password_reset'): Promise<string> {
    const token = randomToken();
    const ttl = purpose === 'activation' ? settings.activationTtlHours * 3_600_000 : settings.resetTtlMinutes * 60_000;
    await db.$transaction([
      // Un enlace nuevo invalida los anteriores del mismo tipo.
      db.activationToken.updateMany({ where: { accountId, purpose, usedAt: null }, data: { usedAt: now() } }),
      db.activationToken.create({ data: { accountId, purpose, tokenHash: sha256(token), expiresAt: new Date(now().getTime() + ttl) } }),
    ]);
    return token;
  }

  async function consumeLinkToken(token: string, purpose: 'activation' | 'password_reset') {
    if (!token || token.length > 100) return null;
    const row = await db.activationToken.findUnique({ where: { tokenHash: sha256(token) }, include: { account: true } });
    if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= now()) return null;
    // Marcar usado de forma atómica: si dos pestañas lo usan a la vez, gana una sola.
    const claimed = await db.activationToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now() } });
    return claimed.count === 1 ? row : null;
  }

  return {
    /**
     * Crea la cuenta (pendiente) de una persona y le manda el enlace de activación.
     * Sin contraseña inicial: la persona la elige al activar.
     */
    async inviteAccount(input: { personId: string; login: string; email: string }, actorPersonId: string | null, meta?: RequestMeta): Promise<Result<{ accountId: string }>> {
      const login = normalizeLogin(input.login);
      if (!LOGIN_PATTERN.test(login)) return err(new DomainError('invalid_input', 'El usuario debe ser un email o tener entre 3 y 40 letras, números, puntos o guiones.'));
      const person = await db.person.findUnique({ where: { id: input.personId }, include: { account: true } });
      if (!person) return err(new DomainError('not_found', 'La persona no existe.'));
      if (person.account) return err(new DomainError('conflict', 'Esta persona ya tiene una cuenta.'));
      if (await db.userAccount.findUnique({ where: { login } })) return err(new DomainError('conflict', 'Ese usuario ya está en uso.'));
      const account = await db.userAccount.create({ data: { personId: person.id, login } });
      const token = await issueLinkToken(account.id, 'activation');
      await mailer.send(
        actionEmail({
          to: input.email,
          subject: `Activá tu cuenta de ${settings.clubName}`,
          clubName: settings.clubName,
          intro: `Hola ${person.firstName}: ya podés usar la app de ${settings.clubName}. Tu usuario es ${login}.`,
          actionLabel: 'Activar mi cuenta',
          actionUrl: `${settings.publicOrigin}/activar?token=${encodeURIComponent(token)}`,
          outro: `El enlace sirve una sola vez y vence en ${settings.activationTtlHours} horas. Si no esperabas este correo, ignoralo.`,
          tag: 'activation',
        }),
      );
      await audit('account.invited', account.id, actorPersonId, meta);
      return ok({ accountId: account.id });
    },

    /** Reenvía la activación de una cuenta pendiente (invalida el enlace anterior). */
    async resendActivation(accountId: string, email: string, actorPersonId: string | null, meta?: RequestMeta): Promise<Result<true>> {
      const account = await db.userAccount.findUnique({ where: { id: accountId }, include: { person: true } });
      if (!account) return err(new DomainError('not_found', 'La cuenta no existe.'));
      if (account.status !== 'pending') return err(new DomainError('conflict', 'La cuenta ya está activa.'));
      const token = await issueLinkToken(account.id, 'activation');
      await mailer.send(
        actionEmail({
          to: email,
          subject: `Activá tu cuenta de ${settings.clubName}`,
          clubName: settings.clubName,
          intro: `Hola ${account.person.firstName}: este es tu nuevo enlace de activación. Tu usuario es ${account.login}.`,
          actionLabel: 'Activar mi cuenta',
          actionUrl: `${settings.publicOrigin}/activar?token=${encodeURIComponent(token)}`,
          outro: `El enlace sirve una sola vez y vence en ${settings.activationTtlHours} horas.`,
          tag: 'activation',
        }),
      );
      await audit('account.activation_resent', account.id, actorPersonId, meta);
      return ok(true);
    },

    async activate(token: string, password: string, meta?: RequestMeta): Promise<Result<IssuedSession>> {
      const peek = await db.activationToken.findUnique({ where: { tokenHash: sha256(token || '-') }, include: { account: true } });
      const problems = passwordProblems(password, { login: peek?.account.login });
      if (problems.length) return err(new DomainError('invalid_input', problems.join(' '), { problems }));
      const row = await consumeLinkToken(token, 'activation');
      if (!row || row.account.status === 'disabled') return err(new DomainError('invalid_input', LINK_INVALID));
      const account = await db.userAccount.update({
        where: { id: row.accountId },
        data: { passwordHash: await hashPassword(password), status: 'active', failedAttempts: 0, lockedUntil: null },
      });
      await audit('account.activated', account.id, account.personId, meta);
      return ok(await issueSession(account, meta));
    },

    async login(loginInput: string, password: string, meta?: RequestMeta): Promise<Result<IssuedSession>> {
      const login = normalizeLogin(loginInput);
      const account = login ? await db.userAccount.findUnique({ where: { login } }) : null;
      const current = now();
      if (!account || !account.passwordHash || account.status === 'pending' || account.status === 'disabled') {
        await verifyPassword(password, await getDummyHash()); // misma demora que una cuenta real
        return err(new DomainError('unauthenticated', GENERIC_LOGIN_ERROR));
      }
      if (account.lockedUntil && account.lockedUntil > current) {
        return err(
          new DomainError('rate_limited', 'Por seguridad bloqueamos el ingreso unos minutos. Probá más tarde o recuperá tu contraseña.', {
            retryAfterSeconds: Math.ceil((account.lockedUntil.getTime() - current.getTime()) / 1000),
          }),
        );
      }
      if (!(await verifyPassword(password, account.passwordHash))) {
        const attempts = account.failedAttempts + 1;
        const lock = attempts >= settings.lockThreshold;
        await db.userAccount.update({
          where: { id: account.id },
          data: lock
            ? { failedAttempts: 0, lockedUntil: new Date(current.getTime() + settings.lockMinutes * 60_000), status: 'locked' }
            : { failedAttempts: attempts },
        });
        if (lock) await audit('account.locked', account.id, null, meta, { minutes: settings.lockMinutes });
        return err(new DomainError('unauthenticated', GENERIC_LOGIN_ERROR));
      }
      await db.userAccount.update({ where: { id: account.id }, data: { failedAttempts: 0, lockedUntil: null, status: 'active', lastLoginAt: current } });
      return ok(await issueSession(account, meta));
    },

    /** Siempre responde igual, exista o no la cuenta. */
    async requestPasswordReset(loginInput: string, meta?: RequestMeta): Promise<void> {
      const login = normalizeLogin(loginInput);
      const account = login
        ? await db.userAccount.findUnique({ where: { login }, include: { person: { select: { firstName: true, email: true } } } })
        : null;
      const email = account?.person.email ?? (login.includes('@') ? login : null);
      if (!account || account.status === 'pending' || account.status === 'disabled' || !email) return;
      const token = await issueLinkToken(account.id, 'password_reset');
      await mailer.send(
        actionEmail({
          to: email,
          subject: `Recuperá tu contraseña de ${settings.clubName}`,
          clubName: settings.clubName,
          intro: `Hola ${account.person.firstName}: pediste elegir una contraseña nueva para ${account.login}.`,
          actionLabel: 'Elegir contraseña nueva',
          actionUrl: `${settings.publicOrigin}/restablecer?token=${encodeURIComponent(token)}`,
          outro: `El enlace sirve una sola vez y vence en ${settings.resetTtlMinutes} minutos. Si no lo pediste, ignorá este correo: tu contraseña no cambia.`,
          tag: 'password_reset',
        }),
      );
      await audit('account.password_reset_requested', account.id, null, meta);
    },

    /** Cambia la contraseña, desbloquea y cierra todas las sesiones anteriores. */
    async resetPassword(token: string, password: string, meta?: RequestMeta): Promise<Result<IssuedSession>> {
      const peek = await db.activationToken.findUnique({ where: { tokenHash: sha256(token || '-') }, include: { account: true } });
      const problems = passwordProblems(password, { login: peek?.account.login });
      if (problems.length) return err(new DomainError('invalid_input', problems.join(' '), { problems }));
      const row = await consumeLinkToken(token, 'password_reset');
      if (!row || row.account.status === 'disabled' || row.account.status === 'pending') return err(new DomainError('invalid_input', LINK_INVALID));
      const [account] = await db.$transaction([
        db.userAccount.update({
          where: { id: row.accountId },
          data: { passwordHash: await hashPassword(password), status: 'active', failedAttempts: 0, lockedUntil: null },
        }),
        db.session.updateMany({ where: { accountId: row.accountId, revokedAt: null }, data: { revokedAt: now() } }),
      ]);
      await audit('account.password_reset', account.id, account.personId, meta);
      return ok(await issueSession(account, meta));
    },

    async getSession(token: string | undefined | null): Promise<SessionInfo | null> {
      if (!token || token.length > 100) return null;
      const s = await db.session.findUnique({
        where: { tokenHash: sha256(token) },
        include: { account: { include: { person: { select: { firstName: true, lastName: true } } } } },
      });
      const current = now();
      if (!s || s.revokedAt || s.expiresAt <= current || s.account.status === 'disabled') return null;
      // Actualizar «última actividad» como mucho cada 5 minutos.
      if (current.getTime() - s.lastSeenAt.getTime() > 5 * 60_000)
        await db.session.update({ where: { id: s.id }, data: { lastSeenAt: current } });
      return {
        sessionId: s.id,
        accountId: s.accountId,
        personId: s.account.personId,
        login: s.account.login,
        firstName: s.account.person.firstName,
        lastName: s.account.person.lastName,
        activeContext: s.activeContext,
        expiresAt: s.expiresAt,
      };
    },

    async logout(token: string | undefined | null): Promise<void> {
      if (!token) return;
      await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: now() } });
    },

    /** Cambia el espacio activo (socio, deporte, coach…). No cambia la identidad. */
    async switchContext(sessionId: string, context: string | null): Promise<void> {
      await db.session.update({ where: { id: sessionId }, data: { activeContext: context } });
    },

    /** Para Lab: abre una sesión de una cuenta activa sin contraseña. Nunca se expone desde el core. */
    issueSessionForAccount: issueSession,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
