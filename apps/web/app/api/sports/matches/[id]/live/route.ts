import { liveView } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { guestAllowed } from '@/lib/guest';
import { getCurrentSession } from '@/lib/session';
import { teamAccess } from '@/lib/sports-access';

export const dynamic = 'force-dynamic';

/** Minuto a minuto: público si está publicado; si no, con sesión y sports:view o con pase de invitado. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const db = getPrisma();
  const view = await liveView(db, (await params).id);
  if (!view) return errorResponse('not_found', 'Partido inexistente', 404);
  if (!view.mamPublic && !(await guestAllowed(view.id))) {
    const session = await getCurrentSession();
    if (!session) return errorResponse('unauthenticated', 'Este partido no es público', 401);
    const m = await db.match.findUniqueOrThrow({ where: { id: view.id }, select: { team: { select: { slug: true, sport: { select: { slug: true } } } } } });
    if (!(await teamAccess(session.personId, m.team)).view) return errorResponse('forbidden', 'No podés ver este partido', 403);
  }
  return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } });
}
