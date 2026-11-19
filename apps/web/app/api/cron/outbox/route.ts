import { processOutbox } from '@clumera/db';
import { purgeExpiredRateLimits } from '@clumera/identity';
import { deliverPendingPush, vapidFromEnv } from '@clumera/notifications';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { consumers } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Tarea programada (Vercel Cron con CRON_SECRET): entrega eventos del outbox, push pendientes y
 * limpia el límite de solicitudes. Repasa lo que la entrega inmediata no alcanzó.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return errorResponse('unauthenticated', 'No autorizado', 401);
  const db = getPrisma();
  const outbox = await processOutbox(db, consumers);
  const vapid = vapidFromEnv();
  const push = vapid ? await deliverPendingPush(db, vapid) : null;
  const purged = await purgeExpiredRateLimits(db);
  return NextResponse.json({ outbox, push, purgedRateLimits: purged });
}
