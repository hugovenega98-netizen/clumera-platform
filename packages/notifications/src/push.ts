/**
 * Push web con VAPID. El contenido viaja cifrado al servicio push del navegador; igual,
 * nunca se mandan datos clínicos ni montos de deuda en el texto de un push.
 */
import webpush from 'web-push';
import { z } from 'zod';

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().refine((u) => u.startsWith('https://'), 'endpoint debe ser https'),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(16), auth: z.string().min(8) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushPayloadSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(240),
  /** Ruta interna a abrir al tocar el aviso. */
  url: z.string().startsWith('/').default('/'),
  /** Mismo tag = el navegador reemplaza el aviso anterior en vez de apilarlo. */
  tag: z.string().max(64).optional(),
});
export type PushPayload = z.input<typeof pushPayloadSchema>;

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export function vapidFromEnv(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim() || 'mailto:soporte@clumera.app';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export type PushOutcome = { status: 'sent' } | { status: 'gone' } | { status: 'failed'; error: string };

export type PushSender = (sub: PushSubscriptionInput, body: string, vapid: VapidConfig) => Promise<{ statusCode: number }>;

const defaultSender: PushSender = (sub, body, vapid) =>
  webpush.sendNotification(sub, body, {
    TTL: 60 * 60 * 24,
    urgency: 'normal',
    vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
  });

/**
 * Envía un push. `gone` (404/410) significa que la suscripción ya no existe y hay que borrarla;
 * cualquier otro error se reintenta más tarde.
 */
export async function sendPush(
  sub: PushSubscriptionInput,
  payload: PushPayload,
  vapid: VapidConfig,
  sender: PushSender = defaultSender,
): Promise<PushOutcome> {
  const body = JSON.stringify(pushPayloadSchema.parse(payload));
  try {
    await sender(sub, body, vapid);
    return { status: 'sent' };
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return { status: 'gone' };
    return { status: 'failed', error: code ? `HTTP ${code}` : (e as Error).message };
  }
}

/** Clave de deduplicación: un aviso por persona y acontecimiento, aunque el evento llegue dos veces. */
export function notificationKey(eventType: string, entityId: string): string {
  return `${eventType}:${entityId}`;
}
