import { cancelCharge } from '@clumera/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Anula un cargo sin pagos. Requiere finance:charge.issue. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('finance:charge.issue', 'No tenés permiso para anular cargos');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ reason: z.string().trim().min(3).max(200) }));
  if (!body.ok) return body.response;
  const r = await cancelCharge(getPrisma(), g.session.personId, (await params).id, body.data.reason);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
