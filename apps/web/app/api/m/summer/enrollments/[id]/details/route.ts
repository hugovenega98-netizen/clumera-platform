import { setCampDetails } from '@clumera/module-summer';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { campEnrollmentFor, guardSummer } from '@/lib/summer-access';

/** Uso de imagen y contacto de emergencia de una inscripción de colonia. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardSummer();
  if (!g.ok) return g.response;
  const e = await campEnrollmentFor(g.session, g.can, (await params).id);
  if (!e.ok) return e.response;
  const body = await parseJson(request, z.object({ imageConsent: z.boolean(), emergencyName: z.string().max(80), emergencyPhone: z.string().max(30) }));
  if (!body.ok) return body.response;
  const r = await setCampDetails(getPrisma(), e.enrollment.id, body.data);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
