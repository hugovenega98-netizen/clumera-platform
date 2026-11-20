import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const dir = fileURLToPath(new URL('../prisma/migrations/', import.meta.url));
const db = new PGlite();

// PGlite aplica todas las migraciones desde cero: en CI, en paralelo con los demás paquetes, tarda más.
beforeAll(async () => {
  for (const name of readdirSync(dir).filter((n) => /^\d+_/.test(n)).sort())
    await db.exec(readFileSync(`${dir}${name}/migration.sql`, 'utf8'));
  await db.exec(`INSERT INTO "Person"(id,"firstName","lastName","updatedAt") VALUES ('p1','Ana','Pérez',now())`);
  await db.exec(`INSERT INTO "Role"(code,name,permissions) VALUES ('coach','Coach','{sports:view}')`);
}, 60_000);

describe('migraciones sobre PostgreSQL', () => {
  it('se aplican desde cero', async () => {
    const r = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
    expect(r.rows[0]?.n).toBeGreaterThanOrEqual(18);
  });

  it('no permite dos avisos del mismo acontecimiento para la misma persona', async () => {
    const insert = `INSERT INTO "Notification"(id,"personId",source,"eventKey",title,body) VALUES ($1,'p1','finance','payment.approved:pay_1','Pago acreditado','ok')`;
    await db.query(insert, ['n1']);
    await expect(db.query(insert, ['n2'])).rejects.toThrow(/unique/i);
  });

  it('no duplica un rol con alcance club (scopeId vacío, no nulo)', async () => {
    const insert = `INSERT INTO "RoleAssignment"(id,"personId","roleCode","scopeType") VALUES ($1,'p1','coach','club')`;
    await db.query(insert, ['r1']);
    await expect(db.query(insert, ['r2'])).rejects.toThrow(/unique/i);
  });

  it('procesa cada evento una sola vez por consumidor', async () => {
    const insert = `INSERT INTO "ProcessedEvent"(consumer,"eventId") VALUES ('bookings','e1')`;
    await db.query(insert);
    await expect(db.query(insert)).rejects.toThrow(/duplicate|unique/i);
  });

  it('la agenda y las reservas rechazan horarios y montos imposibles', async () => {
    await db.exec(`INSERT INTO "Venue"(id,slug,name,"group") VALUES ('v1','padel-2','Pádel 2','Pádel')`);
    const slot = (start: string, end: string, status = 'confirmed', hold: string | null = null) =>
      db.query(`INSERT INTO "AgendaSlot"(id,"venueId","startsAt","endsAt",kind,priority,status,"holdExpiresAt",label,source,"sourceRef") VALUES (gen_random_uuid()::text,'v1',$1,$2,'booking',20,$3,$4,'r','t','x')`, [start, end, status, hold]);
    await expect(slot('2026-11-21T21:00:00Z', '2026-11-21T20:00:00Z')).rejects.toThrow(/check/i);
    await expect(slot('2026-11-21T20:00:00Z', '2026-11-21T21:00:00Z', 'held')).rejects.toThrow(/check/i);
    await expect(db.query(`INSERT INTO "BookingRule"("venueId","depositPercent","updatedAt") VALUES ('v1',150,now())`)).rejects.toThrow(/check/i);
  });
});
