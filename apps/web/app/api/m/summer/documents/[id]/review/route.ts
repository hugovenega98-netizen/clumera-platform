import { reviewCampDocument } from '@clumera/module-summer';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { guardSummer } from '@/lib/summer-access';

/** Aprobar o rechazar (con motivo) un documento de la colonia. Un apto físico pide el permiso de salud. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardSummer('summer:manage');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ approve: z.boolean(), note: z.string().max(200).optional() }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const item = await db.enrollmentDocument.findUnique({ where: { id: (await params).id }, select: { id: true, requirement: { select: { sensitive: true } } } });
  if (!item) return errorResponse('not_found', 'Documento inexistente', 404);
  if (item.requirement.sensitive && !g.can('summer:document.sensitive.view')) return errorResponse('forbidden', 'Revisar este documento pide el permiso de datos de salud', 403);
  const r = await reviewCampDocument(db, g.session.personId, item.id, body.data);
  if (!r.ok) return domainErrorResponse(r.error);
  after(() => deliverNow(db));
  return NextResponse.json(r.value);
}
