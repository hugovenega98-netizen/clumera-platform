import { createGuestPass, revokeGuestPasses } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { guestKey } from '@/lib/guest';
import { domainErrorResponse, errorResponse } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

/** Genera un código de invitado (se muestra una sola vez; se guarda solo su HMAC). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coach');
  if (!g.ok) return g.response;
  const key = guestKey();
  if (!key) return errorResponse('unavailable', 'Los pases de invitado no están configurados en esta instalación', 503);
  const r = await createGuestPass(getPrisma(), g.match.id, g.session.personId, key);
  return r.ok ? NextResponse.json(r.value, { status: 201, headers: { 'cache-control': 'no-store' } }) : domainErrorResponse(r.error);
}

/** Revoca todos los pases vigentes del partido. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coach');
  if (!g.ok) return g.response;
  return NextResponse.json({ revoked: await revokeGuestPasses(getPrisma(), g.match.id) });
}
