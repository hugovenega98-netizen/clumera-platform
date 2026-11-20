import { enrollInSchool } from '@clumera/module-schools';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { guardSchools } from '@/lib/schools-access';
import { actsFor } from '@/lib/sports-access';

/** Inscribir (la persona o su responsable): con lugar confirma y deja la cuota del mes; si no, espera. */
export async function POST(request: Request) {
  const g = await guardSchools('schools:enroll');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ groupId: z.string().min(1).max(64), personId: z.string().min(1).max(64) }));
  if (!body.ok) return body.response;
  if (!(await actsFor(g.session.personId, body.data.personId))) return errorResponse('forbidden', 'Solo podés inscribirte vos o a tu familia a cargo', 403);
  const db = getPrisma();
  const r = await enrollInSchool(db, g.session.personId, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json({ id: r.value.id, status: r.value.status, waitPosition: r.value.waitPosition, chargeId: r.value.chargeId }, { status: 201 });
}
