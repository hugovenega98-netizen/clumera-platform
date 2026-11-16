import { describe, expect, it, vi } from 'vitest';
import { notificationKey, pushSubscriptionSchema, sendPush, vapidFromEnv, type PushSender } from '../src';

const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' } };
const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:x@y.z' };

describe('push', () => {
  it('valida suscripciones', () => {
    expect(pushSubscriptionSchema.safeParse(sub).success).toBe(true);
    expect(pushSubscriptionSchema.safeParse({ ...sub, endpoint: 'http://inseguro' }).success).toBe(false);
  });

  it('envía el contenido validado', async () => {
    const sender = vi.fn<PushSender>().mockResolvedValue({ statusCode: 201 });
    expect(await sendPush(sub, { title: 'Hola', body: 'Prueba' }, vapid, sender)).toEqual({ status: 'sent' });
    expect(JSON.parse(sender.mock.calls[0]![1])).toEqual({ title: 'Hola', body: 'Prueba', url: '/' });
  });

  it('marca como vencida una suscripción que el navegador dio de baja', async () => {
    const sender: PushSender = () => Promise.reject(Object.assign(new Error('Gone'), { statusCode: 410 }));
    expect(await sendPush(sub, { title: 'a', body: 'b' }, vapid, sender)).toEqual({ status: 'gone' });
  });

  it('informa otros errores para reintentar', async () => {
    const sender: PushSender = () => Promise.reject(Object.assign(new Error('x'), { statusCode: 500 }));
    expect(await sendPush(sub, { title: 'a', body: 'b' }, vapid, sender)).toEqual({ status: 'failed', error: 'HTTP 500' });
  });

  it('lee VAPID del entorno solo si está completo', () => {
    expect(vapidFromEnv({})).toBeNull();
    expect(vapidFromEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' })?.subject).toMatch(/^mailto:/);
  });

  it('arma claves de deduplicación estables', () => {
    expect(notificationKey('payment.approved', 'pay_1')).toBe('payment.approved:pay_1');
  });
});
