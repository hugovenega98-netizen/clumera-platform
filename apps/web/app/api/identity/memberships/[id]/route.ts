import { changeMembershipCategory, changeMembershipStatus, MEMBERSHIP_STATUSES } from '@clumera/identity';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Cambiar estado (con motivo) o categoría de una membresía. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('identity:person.manage', 'No tenés permiso para cambiar membresías');
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.union([z.object({ status: z.enum(MEMBERSHIP_STATUSES), reason: z.string().max(200) }), z.object({ categoryCode: z.string().min(1).max(40), reason: z.string().max(200) })]),
  );
  if (!body.ok) return body.response;
  const id = (await params).id;
  const db = getPrisma();
  const r = 'status' in body.data ? await changeMembershipStatus(db, g.session.personId, id, body.data) : await changeMembershipCategory(db, g.session.personId, id, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value);
}
