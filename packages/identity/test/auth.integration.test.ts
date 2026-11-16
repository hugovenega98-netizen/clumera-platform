import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import type { MailMessage } from '@clumera/mail';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthService, DEFAULT_AUTH_SETTINGS, GENERIC_LOGIN_ERROR, hitRateLimit, loadActor, RATE_RULES, syncBaseRoles } from '../src';

const url = testDatabaseUrl('identity');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('autenticación sobre PostgreSQL', () => {
  const prisma = db!;
  const sent: MailMessage[] = [];
  let clock = new Date('2026-11-16T12:00:00Z');
  const auth = createAuthService({
    db: prisma,
    mailer: { driver: 'dev', send: async (m) => void sent.push(m) },
    settings: { ...DEFAULT_AUTH_SETTINGS, publicOrigin: 'https://lab.clumera.app', clubName: 'Club Test' },
    now: () => clock,
  });
  const tokenFrom = (m: MailMessage) => new URL(/https:\/\/\S+/.exec(m.text)![0]).searchParams.get('token')!;

  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    sent.length = 0;
    clock = new Date('2026-11-16T12:00:00Z');
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Person","UserAccount","Session","ActivationToken","AuditLog","RateLimitBucket","RoleAssignment","Role","ClubMembership","MembershipCategory" CASCADE',
    );
  });

  async function invited(login = 'ana@club.test') {
    const person = await prisma.person.create({ data: { firstName: 'Ana', lastName: 'Pérez', email: login } });
    const r = await auth.inviteAccount({ personId: person.id, login, email: login }, null);
    expect(r.ok).toBe(true);
    return { person, token: tokenFrom(sent.at(-1)!) };
  }

  it('invita, activa con enlace de un solo uso y abre sesión', async () => {
    const { person, token } = await invited();
    expect(sent[0]!.subject).toMatch(/Activá tu cuenta/);
    expect(sent[0]!.text).toContain('https://lab.clumera.app/activar?token=');
    // La cuenta pendiente no puede ingresar.
    expect((await auth.login('ana@club.test', 'cualquiera larga')).ok).toBe(false);

    const weak = await auth.activate(token, '123');
    expect(weak.ok).toBe(false);
    const r = await auth.activate(token, 'mi club de los domingos');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const session = await auth.getSession(r.value.token);
    expect(session?.personId).toBe(person.id);
    // El token de la cookie no se guarda en claro.
    expect(await prisma.session.count({ where: { tokenHash: r.value.token } })).toBe(0);
    // Reusar el enlace falla.
    expect((await auth.activate(token, 'mi club de los domingos')).ok).toBe(false);
  });

  it('un enlace vencido no sirve', async () => {
    const { token } = await invited();
    clock = new Date(clock.getTime() + 73 * 3_600_000);
    const r = await auth.activate(token, 'mi club de los domingos');
    expect(r.ok === false && r.error.message).toMatch(/venció/);
  });

  it('login con mensajes genéricos y bloqueo tras 5 intentos', async () => {
    const { token } = await invited();
    await auth.activate(token, 'mi club de los domingos');
    const unknown = await auth.login('nadie@club.test', 'x');
    const wrong = await auth.login('ana@club.test', 'equivocada');
    expect(unknown.ok === false && unknown.error.message).toBe(GENERIC_LOGIN_ERROR);
    expect(wrong.ok === false && wrong.error.message).toBe(GENERIC_LOGIN_ERROR);
    for (let i = 0; i < 4; i++) await auth.login('ANA@club.test ', 'equivocada');
    const locked = await auth.login('ana@club.test', 'mi club de los domingos');
    expect(locked.ok === false && locked.error.code).toBe('rate_limited');
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect((await auth.login('ana@club.test', 'mi club de los domingos')).ok).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'account.locked' } })).toBe(1);
  });

  it('recuperación: no revela cuentas, cambia la contraseña y cierra sesiones viejas', async () => {
    const { token } = await invited();
    const first = await auth.activate(token, 'mi club de los domingos');
    sent.length = 0;
    await auth.requestPasswordReset('nadie@club.test');
    expect(sent).toHaveLength(0);
    await auth.requestPasswordReset('ana@club.test');
    expect(sent).toHaveLength(1);
    const r = await auth.resetPassword(tokenFrom(sent[0]!), 'otra frase bien larga');
    expect(r.ok).toBe(true);
    if (first.ok) expect(await auth.getSession(first.value.token)).toBeNull();
    expect((await auth.login('ana@club.test', 'mi club de los domingos')).ok).toBe(false);
    expect((await auth.login('ana@club.test', 'otra frase bien larga')).ok).toBe(true);
  });

  it('logout revoca la sesión', async () => {
    const { token } = await invited();
    const r = await auth.activate(token, 'mi club de los domingos');
    if (!r.ok) throw r.error;
    await auth.logout(r.value.token);
    expect(await auth.getSession(r.value.token)).toBeNull();
  });

  it('límite de solicitudes por ventana', async () => {
    const rule = { name: 't', limit: 2, windowSeconds: 60 };
    const now = new Date('2026-11-16T12:00:10Z');
    expect((await hitRateLimit(prisma, rule, '1.2.3.4', now)).allowed).toBe(true);
    expect((await hitRateLimit(prisma, rule, '1.2.3.4', now)).allowed).toBe(true);
    expect((await hitRateLimit(prisma, rule, '1.2.3.4', now)).allowed).toBe(false);
    expect((await hitRateLimit(prisma, rule, '5.6.7.8', now)).allowed).toBe(true);
    expect((await hitRateLimit(prisma, rule, '1.2.3.4', new Date('2026-11-16T12:01:10Z'))).allowed).toBe(true);
    expect(await prisma.rateLimitBucket.count({ where: { key: { contains: '1.2.3.4' } } })).toBe(0);
    expect(RATE_RULES.loginByIp.limit).toBeGreaterThan(RATE_RULES.loginByAccount.limit);
  });

  it('el actor suma roles con ámbito y el rol implícito de socio', async () => {
    await syncBaseRoles(prisma, { coach: ['sports:lineup.edit'], member: ['finance:account.view:self'] });
    const p = await prisma.person.create({ data: { firstName: 'Leo', lastName: 'Gómez' } });
    const cat = await prisma.membershipCategory.create({ data: { code: 'activo', name: 'Activo' } });
    await prisma.clubMembership.create({ data: { personId: p.id, categoryId: cat.id, validFrom: new Date('2026-01-01') } });
    await prisma.roleAssignment.create({ data: { personId: p.id, roleCode: 'coach', scopeType: 'team', scopeId: 'm19' } });
    const actor = await loadActor(prisma, p.id, new Date('2026-11-16'));
    expect(actor.assignments).toEqual(
      expect.arrayContaining([
        { role: 'coach', scope: { type: 'team', id: 'm19' } },
        { role: 'member', scope: { type: 'club', id: null } },
      ]),
    );
  });
});
