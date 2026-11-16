import { z } from 'zod';
import { NextResponse } from 'next/server';
import { meta } from '@/lib/auth-routes';
import { authorize } from '@/lib/authz';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { getAuth } from '@/lib/services';

const schema = z.object({ personId: z.string().min(1), login: z.string().min(3).max(200), email: z.email() });

/** Crea la cuenta de una persona y le manda la activación. Requiere identity:person.manage. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const decision = await authorize(session.personId, 'identity:person.manage');
  if (!decision.allowed) return errorResponse('forbidden', 'No tenés permiso para crear cuentas', 403);
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const r = await getAuth().inviteAccount(body.data, session.personId, meta(request));
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
