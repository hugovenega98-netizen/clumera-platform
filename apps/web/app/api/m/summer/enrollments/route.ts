import { enrollInCamp } from '@clumera/module-summer';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { manageablePeople } from '@/lib/schools-access';
import { guardSummer } from '@/lib/summer-access';

/** Inscribir a un chico en la colonia (su responsable): con lugar queda pendiente de documentos y pago. */
export async function POST(request: Request) {
  const g = await guardSummer('summer:camp.enroll');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ groupId: z.string().min(1).max(64), personId: z.string().min(1).max(64) }));
  if (!body.ok) return body.response;
  const family = await manageablePeople(g.session.personId);
  if (!family.some((p) => p.id === body.data.personId)) return errorResponse('forbidden', 'Solo podés inscribir a tu familia a cargo', 403);
  const db = getPrisma();
  const r = await enrollInCamp(db, g.session.personId, { ...body.data, familyIds: family.map((p) => p.id) });
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json({ id: r.value.id, status: r.value.status, waitPosition: r.value.waitPosition, fee: r.value.fee, discount: r.value.discount }, { status: 201 });
}
