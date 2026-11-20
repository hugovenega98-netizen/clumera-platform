import { withdrawFromSchool } from '@clumera/module-schools';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { requireModule } from '@/lib/require-module';
import { permissionChecker } from '@/lib/authz';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/** Baja: la persona, su responsable o la coordinación. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModule('schools');
  if (denied) return denied;
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(request, z.object({ reason: z.string().trim().min(3).max(200) }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const e = await db.enrollment.findUnique({ where: { id: (await params).id }, select: { id: true, personId: true, group: { select: { program: { select: { module: true } } } } } });
  if (!e || e.group.program.module !== 'schools') return errorResponse('not_found', 'Inscripción inexistente', 404);
  const manager = (await permissionChecker(session.personId))('schools:manage');
  if (!manager && !(await actsFor(session.personId, e.personId))) return errorResponse('forbidden', 'Solo podés dar de baja tus inscripciones o las de tu familia a cargo', 403);
  const r = await withdrawFromSchool(db, session.personId, e.id, body.data.reason);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json({ id: r.value.id, promoted: Boolean(r.value.promoted) });
}
