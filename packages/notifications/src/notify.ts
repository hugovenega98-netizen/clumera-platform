import type { PrismaClient } from '@clumera/db';
import { sendPush, type PushSender, type VapidConfig } from './push';

export interface NotifyInput {
  personIds: string[];
  /** Clave del acontecimiento (ver notificationKey): el mismo hecho no genera dos avisos. */
  eventKey: string;
  source: string;
  title: string;
  body: string;
  url?: string;
}

/**
 * Bandeja única: crea un aviso por persona (sin duplicados por acontecimiento) y deja la entrega
 * push pendiente para quienes tengan dispositivos suscriptos.
 */
export async function notify(db: PrismaClient, input: NotifyInput): Promise<{ created: number; notificationIds: string[] }> {
  const ids: string[] = [];
  for (const personId of new Set(input.personIds)) {
    const existing = await db.notification.findUnique({ where: { personId_eventKey: { personId, eventKey: input.eventKey } }, select: { id: true } });
    if (existing) continue;
    try {
      const n = await db.notification.create({
        data: {
          personId,
          eventKey: input.eventKey,
          source: input.source,
          title: input.title,
          body: input.body,
          url: input.url ?? null,
          deliveries: { create: [{ channel: 'inbox', status: 'sent', sentAt: new Date() }, { channel: 'push', status: 'pending' }] },
        },
        select: { id: true },
      });
      ids.push(n.id);
    } catch (e) {
      // Carrera con otra entrega del mismo evento: la restricción única ya lo resolvió.
      if ((e as { code?: string }).code !== 'P2002') throw e;
    }
  }
  return { created: ids.length, notificationIds: ids };
}

export interface DeliveryRunResult {
  sent: number;
  skipped: number;
  failed: number;
  removedSubscriptions: number;
}

const MAX_ATTEMPTS = 5;

/**
 * Entrega los push pendientes a todos los dispositivos de la cuenta de cada persona.
 * Una suscripción que el navegador dio de baja (404/410) se borra.
 */
export async function deliverPendingPush(
  db: PrismaClient,
  vapid: VapidConfig,
  options: { notificationIds?: string[]; limit?: number; sender?: PushSender } = {},
): Promise<DeliveryRunResult> {
  const result: DeliveryRunResult = { sent: 0, skipped: 0, failed: 0, removedSubscriptions: 0 };
  const pending = await db.notificationDelivery.findMany({
    where: { channel: 'push', status: 'pending', attempts: { lt: MAX_ATTEMPTS }, ...(options.notificationIds ? { notificationId: { in: options.notificationIds } } : {}) },
    include: { notification: { include: { person: { include: { account: { include: { pushSubscriptions: true } } } } } } },
    take: options.limit ?? 100,
    orderBy: { id: 'asc' },
  });
  for (const d of pending) {
    const subs = d.notification.person.account?.pushSubscriptions ?? [];
    if (!subs.length) {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: 'skipped', attempts: { increment: 1 } } });
      result.skipped++;
      continue;
    }
    let anySent = false;
    let lastError: string | null = null;
    for (const sub of subs) {
      const outcome = await sendPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        { title: d.notification.title, body: d.notification.body, url: d.notification.url ?? '/avisos', tag: d.notification.eventKey.slice(0, 64) },
        vapid,
        options.sender,
      );
      if (outcome.status === 'sent') {
        anySent = true;
        await db.pushSubscription.update({ where: { id: sub.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } });
      } else if (outcome.status === 'gone') {
        await db.pushSubscription.delete({ where: { id: sub.id } });
        result.removedSubscriptions++;
      } else {
        lastError = outcome.error;
        await db.pushSubscription.update({ where: { id: sub.id }, data: { failureCount: { increment: 1 } } });
      }
    }
    if (anySent) {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: 'sent', sentAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      result.sent++;
    } else if (lastError) {
      const attempts = d.attempts + 1;
      await db.notificationDelivery.update({
        where: { id: d.id },
        data: { attempts, lastError, status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending' },
      });
      result.failed++;
    } else {
      await db.notificationDelivery.update({ where: { id: d.id }, data: { status: 'skipped', attempts: { increment: 1 } } });
      result.skipped++;
    }
  }
  return result;
}

/** Registra (o reasigna) el dispositivo de una cuenta. El endpoint es único por navegador. */
export async function savePushSubscription(
  db: PrismaClient,
  accountId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null,
): Promise<void> {
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { accountId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { accountId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failureCount: 0, userAgent: userAgent?.slice(0, 300) ?? null },
  });
}

export async function removePushSubscription(db: PrismaClient, accountId: string, endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { accountId, endpoint } });
}
