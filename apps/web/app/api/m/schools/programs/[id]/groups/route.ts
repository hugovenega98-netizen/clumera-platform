import { createGroup } from '@clumera/module-schools';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardSchools } from '@/lib/schools-access';

/** Nuevo grupo de una propuesta (coordinación): días, horario, cupo, lugar y profesor. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardSchools('schools:manage');
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({
      name: z.string().min(2).max(60),
      days: z.number().int().min(1).max(127),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      durationMinutes: z.number().int().min(15).max(720),
      capacity: z.number().int().min(1).max(500),
      place: z.string().max(80).optional(),
      teacherName: z.string().max(80).optional(),
    }),
  );
  if (!body.ok) return body.response;
  const [h, m] = body.data.time.split(':').map(Number);
  const r = await createGroup(getPrisma(), g.session.personId, (await params).id, { ...body.data, startMinute: h! * 60 + m! });
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
