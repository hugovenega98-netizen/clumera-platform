import { pushSubscriptionSchema, sendPush, vapidFromEnv } from '@clumera/notifications';
import { NextResponse } from 'next/server';
import { clientConfig } from '@/lib/client-config';

/**
 * Push de prueba de punta a punta (criterio de terminado de la Fase 0). Recibe la suscripción del
 * navegador y le manda un aviso en el momento, sin guardarla. Solo existe si CLUMERA_PUSH_TEST=1
 * (Lab y pruebas); la suscripción persistente por cuenta llega con autenticación.
 */
export async function POST(request: Request) {
  if (process.env.CLUMERA_PUSH_TEST !== '1') return NextResponse.json({ error: { code: 'not_found', message: 'No disponible' } }, { status: 404 });
  const vapid = vapidFromEnv();
  if (!vapid) return NextResponse.json({ error: { code: 'invalid_input', message: 'Faltan las claves VAPID del servidor' } }, { status: 503 });

  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'invalid_input', message: 'Suscripción inválida' } }, { status: 400 });

  const outcome = await sendPush(
    parsed.data,
    { title: clientConfig.identity.displayName, body: 'Los avisos de la app ya funcionan en este dispositivo.', url: '/', tag: 'push-test' },
    vapid,
  );
  if (outcome.status === 'sent') return NextResponse.json({ ok: true });
  return NextResponse.json({ error: { code: 'conflict', message: outcome.status === 'gone' ? 'La suscripción ya no es válida' : outcome.error } }, { status: 502 });
}
