import { checkAccess, listAccessPoints } from '@clumera/module-access';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAccess } from '@/lib/access';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { getCredentials } from '@/lib/services';

/**
 * Validación de un QR (forma de Hito A, para lectores e integraciones): `{ valid, reason, message,
 * person }`. Pasa por Accesos, así que el intento queda registrado en el punto indicado o en el
 * primero activo. Nunca deuda ni salud. La pantalla de Recepción usa `/api/m/access/check`.
 */
export async function POST(request: Request) {
  const g = await guardAccess('access:validate');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ token: z.string().min(1).max(200), pointId: z.string().min(1).max(64).optional() }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const pointId = body.data.pointId ?? (await listAccessPoints(db))[0]?.id;
  if (!pointId) return errorResponse('conflict', 'El club todavía no tiene puntos de acceso', 409);
  const r = await checkAccess(db, getCredentials(), g.session.personId, { pointId, token: body.data.token });
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  const v = r.value;
  return NextResponse.json(
    { valid: v.granted, reason: v.reason ?? undefined, message: v.detail, detail: v.detail, person: v.person ?? undefined, attemptId: v.attemptId },
    { headers: { 'cache-control': 'no-store' } },
  );
}
