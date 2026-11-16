import { createPrismaClient } from '@clumera/db';
import { testDatabaseUrl } from '@clumera/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { deliverPendingPush, notify, savePushSubscription, type PushSender } from '../src';

const url = testDatabaseUrl('notifications');
const db = url ? createPrismaClient(url) : null;
const vapid = { publicKey: 'p', privateKey: 'k', subject: 'mailto:x@y.z' };
const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' };

describe.skipIf(!db)('avisos sobre PostgreSQL', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  let personId = '';
  let accountId = '';
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE "Person","UserAccount","PushSubscription","Notification","NotificationDelivery" CASCADE');
    const p = await prisma.person.create({ data: { firstName: 'Ana', lastName: 'P', account: { create: { login: 'ana', status: 'active' } } }, include: { account: true } });
    personId = p.id;
    accountId = p.account!.id;
  });

  it('no duplica avisos del mismo acontecimiento', async () => {
    const input = { personIds: [personId, personId], eventKey: 'payment.approved:pay_1', source: 'finance', title: 'Pago', body: 'Acreditado' };
    expect((await notify(prisma, input)).created).toBe(1);
    expect((await notify(prisma, input)).created).toBe(0);
    expect(await prisma.notification.count()).toBe(1);
  });

  it('entrega push a todos los dispositivos y borra los dados de baja', async () => {
    await savePushSubscription(prisma, accountId, { endpoint: 'https://push.test/ok', keys });
    await savePushSubscription(prisma, accountId, { endpoint: 'https://push.test/gone', keys });
    const sender: PushSender = async (sub) => {
      if (sub.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      return { statusCode: 201 };
    };
    await notify(prisma, { personIds: [personId], eventKey: 'test:1', source: 'notifications', title: 'Hola', body: 'Prueba' });
    expect(await deliverPendingPush(prisma, vapid, { sender })).toEqual({ sent: 1, skipped: 0, failed: 0, removedSubscriptions: 1 });
    expect(await prisma.pushSubscription.count()).toBe(1);
    expect(await deliverPendingPush(prisma, vapid, { sender })).toEqual({ sent: 0, skipped: 0, failed: 0, removedSubscriptions: 0 });
  });

  it('sin dispositivos el push se omite (el aviso queda en la bandeja)', async () => {
    await notify(prisma, { personIds: [personId], eventKey: 'test:2', source: 'notifications', title: 'Hola', body: 'Prueba' });
    expect((await deliverPendingPush(prisma, vapid)).skipped).toBe(1);
    expect(await prisma.notificationDelivery.count({ where: { channel: 'inbox', status: 'sent' } })).toBe(1);
  });
});
