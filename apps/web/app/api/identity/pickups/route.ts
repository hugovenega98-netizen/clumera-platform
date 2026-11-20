import { authorizePickup } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { docPepper } from '@/lib/people-api';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/** Autorizar a alguien a retirar a un menor a cargo (con su documento: se guarda digest + últimos 4). */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(
    request,
    z.object({ minorId: z.string().min(1).max(64), firstName: z.string().min(2).max(60), lastName: z.string().min(2).max(60), relation: z.string().min(3).max(40), document: z.string().min(6).max(20), phone: z.string().max(30).optional() }),
  );
  if (!body.ok) return body.response;
  if (body.data.minorId === session.personId || !(await actsFor(session.personId, body.data.minorId))) return errorResponse('forbidden', 'Solo podés autorizar retiros de tu familia a cargo', 403);
  const pepper = docPepper();
  if (!pepper) return errorResponse('not_configured', 'Falta la clave de documentos de la instalación', 503);
  const r = await authorizePickup(getPrisma(), session.personId, body.data, pepper);
  return r.ok ? NextResponse.json({ id: r.value.id }, { status: 201 }) : domainErrorResponse(r.error);
}
