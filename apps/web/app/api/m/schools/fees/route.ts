import { issueMonthlyFees } from '@clumera/module-schools';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardSchools } from '@/lib/schools-access';

/** Emitir las cuotas del mes de todas las inscripciones confirmadas (idempotente). */
export async function POST(request: Request) {
  const g = await guardSchools('schools:manage');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }));
  if (!body.ok) return body.response;
  const r = await issueMonthlyFees(getPrisma(), g.session.personId, body.data.period);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
