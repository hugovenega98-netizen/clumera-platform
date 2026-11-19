import { issueCharge } from '@clumera/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

const schema = z.object({
  personId: z.string().min(1),
  concept: z.enum(['arancel', 'reserva', 'colonia', 'evento', 'tienda', 'cuota_social', 'otro']),
  groupLabel: z.string().trim().min(1).max(60),
  description: z.string().trim().min(3).max(120),
  amount: z.number().int().positive(),
  dueDate: z.iso.date(),
  /** Una por formulario: repetir el envío no duplica el cargo. */
  requestId: z.uuid(),
});

/** Emite un cargo manual. Requiere finance:charge.issue. */
export async function POST(request: Request) {
  const g = await guard('finance:charge.issue', 'No tenés permiso para emitir cargos');
  if (!g.ok) return g.response;
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const d = body.data;
  const r = await issueCharge(getPrisma(), g.session.personId, {
    personId: d.personId,
    concept: d.concept,
    groupLabel: d.groupLabel,
    description: d.description,
    amount: d.amount,
    dueDate: new Date(`${d.dueDate}T00:00:00Z`),
    source: 'manual',
    sourceRef: d.requestId,
  });
  return r.ok ? NextResponse.json(r.value, { status: r.value.created ? 201 : 200 }) : domainErrorResponse(r.error);
}
