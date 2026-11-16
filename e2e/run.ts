/**
 * Prepara bases, claves y licencia; compila las tres apps con el entorno e2e; levanta los servidores
 * y corre Playwright. Uso: TEST_PG_URL=postgresql://postgres@localhost:5432 npm run e2e -w @clumera/e2e
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { hashPassword } from '@clumera/identity';
import { generateLicenseKeys, signLicense } from '@clumera/kernel';
import { ADMIN, CORE_URL, LAB_DB, LAB_URL, LICENSED, MGMT_DB, MGMT_URL, PG } from './env';

const root = path.resolve(import.meta.dirname, '..');
const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv, cwd = root) => execFileSync(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });

const keys = await generateLicenseKeys();
const now = new Date();
const license = await signLicense(
  { v: 1, licenseId: 'lic_e2e', clientId: 'clumera-lab', modules: LICENSED, limits: { sports: 2 }, issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 86_400_000).toISOString() },
  keys.privateKey,
);
const mgmtKeys = await generateLicenseKeys();

const common = { NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' };
const coreEnv = {
  ...common,
  CLUMERA_CLIENT_ID: 'clumera-lab',
  DATABASE_URL: `${PG}/${LAB_DB}`,
  CLUMERA_LICENSE: license,
  CLUMERA_LICENSE_PUBLIC_KEY: keys.publicKey,
  CLUMERA_PUBLIC_ORIGIN: LAB_URL,
  CLUMERA_MAIL_DRIVER: 'dev',
  CRON_SECRET: randomBytes(24).toString('hex'),
};
const labEnv = { ...coreEnv, CLUMERA_LAB: '1', LAB_DATABASE_NAME: LAB_DB, LAB_CORE_URL: CORE_URL };
const mgmtEnv = {
  ...common,
  MANAGEMENT_DATABASE_URL: `${PG}/${MGMT_DB}`,
  MANAGEMENT_ADMIN_EMAIL: ADMIN.email,
  MANAGEMENT_ADMIN_PASSWORD_HASH: await hashPassword(ADMIN.password),
  MANAGEMENT_SESSION_SECRET: randomBytes(32).toString('hex'),
  MANAGEMENT_LICENSE_PUBLIC_KEY: mgmtKeys.publicKey,
  MANAGEMENT_LICENSE_PRIVATE_KEY: mgmtKeys.privateKey,
};

run('node', ['tooling/prepare-test-databases.mjs'], { TEST_PG_URL: PG });
run('npm', ['run', 'seed', '-w', '@clumera/lab'], labEnv);
if (process.env.E2E_SKIP_BUILD !== '1') {
  run('npx', ['turbo', 'run', 'build', '--filter=@clumera/web', '--force'], coreEnv);
  run('npx', ['turbo', 'run', 'build', '--filter=@clumera/lab', '--force'], labEnv);
  run('npx', ['turbo', 'run', 'build', '--filter=@clumera/management', '--force'], mgmtEnv);
}

const servers: ChildProcess[] = [];
const start = (dir: string, port: number, env: NodeJS.ProcessEnv) => {
  // Grupo de procesos propio: al terminar se mata el grupo entero (npx → next → next-server).
  const nextBin = path.join(root, 'node_modules/next/dist/bin/next');
  const p = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], { cwd: path.join(root, dir), env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'inherit'], detached: true });
  servers.push(p);
};
start('apps/web', 3300, coreEnv);
start('apps/lab', 3301, labEnv);
start('apps/management', 3400, mgmtEnv);

async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual' });
      if (r.status < 500) return;
    } catch {
      /* todavía no levantó */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No levantó ${url}`);
}

let code: number;
try {
  await Promise.all([waitFor(`${CORE_URL}/api/health`), waitFor(`${LAB_URL}/lab`), waitFor(`${MGMT_URL}/login`)]);
  try {
    run('npx', ['playwright', 'test', ...process.argv.slice(2)], { E2E_CRON_SECRET: coreEnv.CRON_SECRET }, import.meta.dirname);
    code = 0;
  } catch {
    code = 1;
  }
} finally {
  for (const s of servers) if (s.pid) process.kill(-s.pid, 'SIGKILL');
}
process.exit(code);
