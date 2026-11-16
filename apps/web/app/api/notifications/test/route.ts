import { RATE_RULES } from '@clumera/identity';
import { deliverPendingPush, notify, vapidFromEnv } from '@clumera/notifications';
import { NextResponse } from 'next/server';
import { clientConfig } from '@/lib/client-config';
import { getPrisma } from '@/lib/db';
import { errorResponse, rateLimited } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';

/**
 * Aviso de prueba a uno mismo, de punta a punta: pasa por la bandeja (notify) y por la entrega
 * push a los dispositivos guardados de la cuenta. Criterio de terminado de la Fase 0.
 */
export async function POST() {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const limited = await rateLimited(RATE_RULES.pushTestByAccount, session.accountId);
  if (limited) return limited;
  const vapid = vapidFromEnv();
  if (!vapid) return errorResponse('unavailable', 'Los avisos push no están configurados en este club', 503);
  const db = getPrisma();
  const { notificationIds } = await notify(db, {
    personIds: [session.personId],
    eventKey: `notifications.test:${Date.now()}`,
    source: 'notifications',
    title: clientConfig.identity.displayName,
    body: 'Los avisos ya funcionan en este dispositivo.',
    url: '/avisos',
  });
  const result = await deliverPendingPush(db, vapid, { notificationIds });
  if (result.sent === 0)
    return errorResponse('push_not_delivered', result.skipped ? 'No hay dispositivos con avisos activados en tu cuenta.' : 'El servicio de avisos rechazó el envío.', 502, { ...result });
  return NextResponse.json({ ok: true, ...result });
}
