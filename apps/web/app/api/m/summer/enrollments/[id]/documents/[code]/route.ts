import { RATE_RULES } from '@clumera/identity';
import { submitCampDocument } from '@clumera/module-summer';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, rateLimited } from '@/lib/http';
import { campEnrollmentFor, guardSummer } from '@/lib/summer-access';

/** Subir (o reemplazar) un documento de la colonia: PDF o foto, hasta 4 MB. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; code: string }> }) {
  const g = await guardSummer();
  if (!g.ok) return g.response;
  const { id, code } = await params;
  const e = await campEnrollmentFor(g.session, g.can, id);
  if (!e.ok) return e.response;
  const limited = await rateLimited(RATE_RULES.uploadsByAccount, g.session.personId);
  if (limited) return limited;
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return errorResponse('invalid_input', 'Elegí un archivo', 400);
  const r = await submitCampDocument(getPrisma(), g.session.personId, { enrollmentId: e.enrollment.id, code: code.slice(0, 40), filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
