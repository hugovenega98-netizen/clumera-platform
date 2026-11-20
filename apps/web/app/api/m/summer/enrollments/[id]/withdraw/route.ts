import { withdrawFromCamp } from '@clumera/module-summer';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { campEnrollmentFor, guardSummer } from '@/lib/summer-access';

/** Baja de la colonia (la familia o la coordinación). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardSummer();
  if (!g.ok) return g.response;
  const e = await campEnrollmentFor(g.session, g.can, (await params).id);
  if (!e.ok) return e.response;
  const body = await parseJson(request, z.object({ reason: z.string().trim().min(3).max(200) }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const r = await withdrawFromCamp(db, g.session.personId, e.enrollment.id, body.data.reason);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json({ id: r.value.id, promoted: Boolean(r.value.promoted) });
}
