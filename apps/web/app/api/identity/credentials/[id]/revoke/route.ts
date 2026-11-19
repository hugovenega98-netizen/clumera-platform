import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { errorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';
import { getCredentials } from '@/lib/services';

/** Revoca un carnet (pérdida, robo, baja). El QR deja de servir en la entrada. Requiere identity:person.manage. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('identity:person.manage', 'No tenés permiso para revocar carnets');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ reason: z.string().trim().min(3).max(200) }));
  if (!body.ok) return body.response;
  const { id } = await params;
  const db = getPrisma();
  const credential = await db.credential.findUnique({ where: { id }, select: { id: true, personId: true, status: true } });
  if (!credential) return errorResponse('not_found', 'Carnet inexistente', 404);
  if (credential.status !== 'active') return errorResponse('conflict', 'El carnet ya no está vigente', 409);
  await getCredentials().revoke(id, body.data.reason);
  await db.auditLog.create({ data: { actorPersonId: g.session.personId, action: 'credential.revoked', entityType: 'person', entityId: credential.personId, diff: { reason: body.data.reason } } });
  return NextResponse.json({ ok: true });
}
