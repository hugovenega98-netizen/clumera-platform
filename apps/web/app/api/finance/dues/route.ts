import { issueMonthlyDues } from '@clumera/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Emite las cuotas sociales de un período (idempotente). Requiere finance:charge.issue. */
export async function POST(request: Request) {
  const g = await guard('finance:charge.issue', 'No tenés permiso para emitir cuotas');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), dueDay: z.number().int().min(1).max(28).default(10) }));
  if (!body.ok) return body.response;
  const r = await issueMonthlyDues(getPrisma(), g.session.personId, body.data.period, body.data.dueDay);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
