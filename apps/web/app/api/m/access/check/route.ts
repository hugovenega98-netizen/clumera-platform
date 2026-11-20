import { checkAccess } from '@clumera/module-access';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAccess } from '@/lib/access';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { getCredentials } from '@/lib/services';

/**
 * Validar en un punto de acceso: un QR escaneado o tipeado (`token`) o la persona buscada
 * (`personId`). Responde permitido o denegado, motivo y nombre; nunca deuda ni salud.
 */
export async function POST(request: Request) {
  const g = await guardAccess('access:validate');
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({ pointId: z.string().min(1).max(64), token: z.string().trim().min(1).max(200).optional(), personId: z.string().min(1).max(64).optional() }),
  );
  if (!body.ok) return body.response;
  const db = getPrisma();
  const r = await checkAccess(db, getCredentials(), g.session.personId, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value, { headers: { 'cache-control': 'no-store' } });
}
