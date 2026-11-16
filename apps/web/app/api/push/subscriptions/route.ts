import { pushSubscriptionSchema, removePushSubscription, savePushSubscription } from '@clumera/notifications';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';

/** Guarda el dispositivo de la cuenta para recibir avisos push. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para activar avisos', 401);
  const body = await parseJson(request, pushSubscriptionSchema);
  if (!body.ok) return body.response;
  await savePushSubscription(getPrisma(), session.accountId, body.data, request.headers.get('user-agent'));
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(request, z.object({ endpoint: z.url() }));
  if (!body.ok) return body.response;
  await removePushSubscription(getPrisma(), session.accountId, body.data.endpoint);
  return NextResponse.json({ ok: true });
}
