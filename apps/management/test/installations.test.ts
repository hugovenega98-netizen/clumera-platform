import { generateLicenseKeys, verifyLicense } from '@clumera/kernel';
import { parseClientConfig } from '@clumera/config';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkAdminCredentials, issueAdminToken, readAdminToken } from '../src/admin-session';
import { createManagementDb } from '../src/db';
import { createInstallationService, installationEnv, installationInput, moduleProblems, scaffoldClientConfig } from '../src/installations';
import { hashPassword } from '@clumera/identity';

describe('alta: reglas', () => {
  it('exige dependencias de módulos con mensajes claros', () => {
    expect(moduleProblems(['bookings'])).toEqual(['Reservas necesita Instalaciones']);
    expect(moduleProblems(['bookings', 'facilities'])).toEqual([]);
    expect(moduleProblems(['nada'])).toEqual(['Módulo desconocido: nada']);
  });

  it('genera una config de club válida', () => {
    const input = installationInput.parse({ clientId: 'club-sur', clubName: 'Club Atlético Sur', displayName: 'Atlético Sur del Oeste', subdomain: 'sur', modules: ['store'] });
    const cfg = scaffoldClientConfig(input);
    expect(parseClientConfig(cfg).ok).toBe(true);
    expect(cfg.identity.shortName.length).toBeLessThanOrEqual(12);
  });
});

describe('acceso de administrador', () => {
  const env = { MANAGEMENT_SESSION_SECRET: 'x'.repeat(40), MANAGEMENT_ADMIN_EMAIL: 'hugo@clumera.app' } as Record<string, string>;
  it('firma y verifica la cookie, y la rechaza alterada o vencida', () => {
    const { token } = issueAdminToken('hugo@clumera.app', env, 0);
    expect(readAdminToken(token, env, 1000)).toEqual({ email: 'hugo@clumera.app' });
    expect(readAdminToken(token + 'x', env, 1000)).toBeNull();
    expect(readAdminToken(token, env, 13 * 3_600_000)).toBeNull();
    expect(readAdminToken(token, { ...env, MANAGEMENT_ADMIN_EMAIL: 'otro@clumera.app' }, 1000)).toBeNull();
  });
  it('valida credenciales contra el hash', async () => {
    const e = { ...env, MANAGEMENT_ADMIN_PASSWORD_HASH: await hashPassword('frase larga de admin') };
    expect(await checkAdminCredentials('HUGO@clumera.app', 'frase larga de admin', e)).toBe(true);
    expect(await checkAdminCredentials('hugo@clumera.app', 'otra', e)).toBe(false);
    expect(await checkAdminCredentials('hugo@clumera.app', 'frase larga de admin', env)).toBe(false);
  });
});

const url = testDatabaseUrl('management');
describe.skipIf(!url)('alta de instalación sobre PostgreSQL', () => {
  const db = createManagementDb(url!);
  let keys: { publicKey: string; privateKey: string };
  beforeAll(async () => {
    keys = await generateLicenseKeys();
  });
  afterAll(() => db.$disconnect());
  beforeEach(async () => {
    await db.$executeRawUnsafe('TRUNCATE "Installation","License","InstallationEvent" CASCADE');
  });

  it('crea la instalación con una licencia que la instalación puede verificar', async () => {
    const svc = createInstallationService(db, keys);
    const r = await svc.create({ clientId: 'club-sur', clubName: 'Club Atlético Sur', displayName: 'Atlético Sur', subdomain: 'sur', modules: ['facilities', 'bookings'], sportsLimit: 3 }, 'hugo');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = await verifyLicense(r.license.token, { publicKey: keys.publicKey, clientId: 'club-sur' });
    expect(v.ok && v.value.modules).toEqual(['bookings', 'facilities']);
    expect(v.ok && v.value.limits.sports).toBe(3);
    const env = installationEnv('club-sur', r.license.token, keys, 'https://sur.clumera.app');
    expect(env.CLUMERA_LICENSE_PUBLIC_KEY).toBe(keys.publicKey);
    expect(Object.values(env).join()).not.toContain(keys.privateKey);
  });

  it('rechaza duplicados y dependencias faltantes', async () => {
    const svc = createInstallationService(db, keys);
    await svc.create({ clientId: 'club-sur', clubName: 'Club Sur', displayName: 'Sur', subdomain: 'sur' }, 'hugo');
    const dup = await svc.create({ clientId: 'club-sur', clubName: 'Club Sur', displayName: 'Sur', subdomain: 'otro' }, 'hugo');
    const deps = await svc.create({ clientId: 'club-norte', clubName: 'Club Norte', displayName: 'Norte', subdomain: 'norte', modules: ['bookings'] }, 'hugo');
    expect(dup.ok === false && dup.problems).toContain('Ese identificador ya existe');
    expect(deps.ok === false && deps.problems).toContain('Reservas necesita Instalaciones');
  });

  it('reemitir revoca la licencia anterior', async () => {
    const svc = createInstallationService(db, keys);
    const r = await svc.create({ clientId: 'club-sur', clubName: 'Club Sur', displayName: 'Sur', subdomain: 'sur' }, 'hugo');
    if (!r.ok) throw new Error('alta');
    await svc.reissueLicense(r.installation.id, { modules: ['store'], sportsLimit: 1, expiresAt: null }, 'hugo');
    expect(await db.license.count({ where: { installationId: r.installation.id, revokedAt: null } })).toBe(1);
    expect((await svc.activeLicense(r.installation.id))?.modules).toEqual(['store']);
    expect(await db.installationEvent.count({ where: { type: 'license.issued' } })).toBe(2);
  });
});
