import { markAttendance } from '@clumera/module-schools';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { requireModule } from '@/lib/require-module';
import { guardSchools } from '@/lib/schools-access';

/** Guardar la asistencia del día (profesor de la actividad del grupo, o coordinación). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireModule('schools');
  if (denied) return denied;
  const db = getPrisma();
  const group = await db.group.findUnique({ where: { id: (await params).id }, select: { id: true, program: { select: { module: true, activity: true } } } });
  const g = await guardSchools('schools:attendance.mark', group?.program.activity ?? '__none__');
  if (!g.ok) return g.response;
  if (!group || group.program.module !== 'schools') return errorResponse('not_found', 'Grupo inexistente', 404);
  const body = await parseJson(
    request,
    z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), marks: z.array(z.object({ personId: z.string().min(1).max(64), mark: z.enum(['present', 'absent', 'late']) })).min(1).max(500) }),
  );
  if (!body.ok) return body.response;
  const r = await markAttendance(db, g.session.personId, group.id, body.data.day, body.data.marks);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
