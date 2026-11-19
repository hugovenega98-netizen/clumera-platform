import { recordPayment } from '@clumera/finance';
import { after, NextResponse } from 'next/server';
import { deliverNow } from '@/lib/consumers';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

const schema = z.object({
  payerPersonId: z.string().min(1).nullable(),
  chargeIds: z.array(z.string().min(1)).min(1).max(50),
  method: z.enum(['cash', 'transfer', 'card']),
  amount: z.number().int().positive().optional(),
  note: z.string().trim().max(200).optional(),
});

/** Registra un cobro presencial y lo imputa. Requiere finance:payment.record. */
export async function POST(request: Request) {
  const g = await guard('finance:payment.record', 'No tenés permiso para registrar cobros');
  if (!g.ok) return g.response;
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const r = await recordPayment(getPrisma(), g.session.personId, body.data);
  // El aviso «pago acreditado» sale enseguida; si falla, lo repasa el cron.
  if (r.ok) after(() => deliverNow(getPrisma()).catch(() => undefined));
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
