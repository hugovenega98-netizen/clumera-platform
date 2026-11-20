import { authorizeException } from '@clumera/module-access';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAccess } from '@/lib/access';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';

/** Excepción autorizada sobre un rechazo: con motivo, queda registrada y auditada. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardAccess('access:override');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ reason: z.string().trim().min(1).max(200) }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const r = await authorizeException(db, g.session.personId, (await params).id, body.data.reason);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value, { status: 201 });
}
