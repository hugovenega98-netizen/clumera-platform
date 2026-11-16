/**
 * Prepara la base de una instalación (idempotente):
 *   - sincroniza los roles base del catálogo;
 *   - opcionalmente crea el primer superadmin y le manda la activación por correo.
 *
 *   DATABASE_URL=... CLUMERA_CLIENT_ID=... npm run bootstrap -w @clumera/web -- \
 *     --admin-email admin@club.com --admin-first Ana --admin-last Pérez
 *
 * Antes: `npm run migrate:deploy -w @clumera/db` contra la base de ESTA instalación.
 */
import { parseArgs } from 'node:util';
import { baseRoles, roleNames } from '@clumera/catalog';
import { publicOrigin } from '@clumera/config';
import { loadClientConfig } from '@clumera/config/node';
import { createPrismaClient } from '@clumera/db';
import { createAuthService, DEFAULT_AUTH_SETTINGS, syncBaseRoles } from '@clumera/identity';
import { mailerFromEnv } from '@clumera/mail';

const { values } = parseArgs({
  options: { 'admin-email': { type: 'string' }, 'admin-first': { type: 'string' }, 'admin-last': { type: 'string' } },
});

const cfg = loadClientConfig();
const db = createPrismaClient();
try {
  await syncBaseRoles(db, baseRoles, roleNames);
  console.log(`✓ ${Object.keys(baseRoles).length} roles base sincronizados (${cfg.identity.clientId})`);

  const email = values['admin-email']?.trim().toLowerCase();
  if (email) {
    const existing = await db.userAccount.findUnique({ where: { login: email } });
    if (existing) console.log(`= ya existe la cuenta ${email} (${existing.status})`);
    else {
      const person = await db.person.create({
        data: { firstName: values['admin-first'] ?? 'Administrador', lastName: values['admin-last'] ?? cfg.identity.shortName, email },
      });
      await db.roleAssignment.create({ data: { personId: person.id, roleCode: 'superadmin', scopeType: 'club' } });
      const mailer = mailerFromEnv(process.env as Record<string, string | undefined>, async (m) => {
        await db.devMailMessage.create({ data: { to: m.to, subject: m.subject, text: m.text, html: m.html ?? null, tag: m.tag ?? null } });
      });
      const auth = createAuthService({
        db,
        mailer,
        settings: { ...DEFAULT_AUTH_SETTINGS, publicOrigin: process.env.CLUMERA_PUBLIC_ORIGIN?.trim() || publicOrigin(cfg), clubName: cfg.identity.displayName },
      });
      const r = await auth.inviteAccount({ personId: person.id, login: email, email }, null);
      if (!r.ok) throw r.error;
      console.log(`✓ superadmin ${email} creado; activación enviada por ${mailer.driver === 'dev' ? 'la bandeja de desarrollo' : 'correo'}`);
    }
  }
} finally {
  await db.$disconnect();
}
