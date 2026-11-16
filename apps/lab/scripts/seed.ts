/**
 * Restaura la base de Lab al seed base: vacía todo y vuelve a sembrar.
 *   DATABASE_URL=... CLUMERA_LAB=1 LAB_DATABASE_NAME=clumera_lab CLUMERA_CLIENT_ID=clumera-lab npm run seed -w @clumera/lab
 */
import { publicOrigin } from '@clumera/config';
import { loadClientConfig } from '@clumera/config/node';
import { createPrismaClient } from '@clumera/db';
import { createDevMailer } from '@clumera/mail';
import { assertLabTarget } from '../src/guard';
import { seedLab, wipeLab } from '../src/seed';

const cfg = loadClientConfig();
const db = createPrismaClient();
try {
  await assertLabTarget(db, process.env, cfg.identity.clientId);
  await wipeLab(db);
  const mailer = createDevMailer(async (m) => {
    await db.devMailMessage.create({ data: { to: m.to, subject: m.subject, text: m.text, html: m.html ?? null, tag: m.tag ?? null } });
  });
  const r = await seedLab(db, { publicOrigin: process.env.CLUMERA_PUBLIC_ORIGIN?.trim() || publicOrigin(cfg), clubName: cfg.identity.displayName, mailer });
  console.log(`✓ Lab restaurado: ${r.people} personas`);
} finally {
  await db.$disconnect();
}
