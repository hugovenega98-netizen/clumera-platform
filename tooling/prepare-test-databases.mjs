#!/usr/bin/env node
/** Crea (o recrea) las bases clumera_test_* en TEST_PG_URL y les aplica las migraciones. Nunca usar un servidor de clientes. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const base = process.env.TEST_PG_URL?.replace(/\/+$/, '');
if (!base) {
  console.error('Definí TEST_PG_URL, por ejemplo postgresql://postgres@localhost:5432');
  process.exit(1);
}
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', 'postgres'].includes(host) && process.env.ALLOW_REMOTE_TEST_DB !== '1') {
  console.error(`TEST_PG_URL apunta a ${host}: solo se aceptan servidores locales o de CI (ALLOW_REMOTE_TEST_DB=1 para forzar).`);
  process.exit(1);
}
// Management tiene su propia base y sus propias migraciones.
const names = ['db', 'identity', 'notifications', 'finance', 'web', 'lab', 'management'];
const root = path.resolve(import.meta.dirname, '..');
const psql = (sql) => execFileSync('psql', [`${base}/postgres`, '-qc', sql], { stdio: 'inherit' });
for (const name of names) {
  const db = `clumera_test_${name}`;
  psql(`DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  psql(`CREATE DATABASE ${db}`);
  const isMgmt = name === 'management';
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: path.join(root, isMgmt ? 'apps/management' : 'packages/db'),
    env: { ...process.env, [isMgmt ? 'MANAGEMENT_DATABASE_URL' : 'DATABASE_URL']: `${base}/${db}` },
    stdio: 'ignore',
  });
  console.log(`✓ ${db}`);
}
