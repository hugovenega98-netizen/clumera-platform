import { guardiansOf } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { authorize } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { getCredentials } from '@/lib/services';
import { getCurrentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * Carnet con su QR vigente. Pasa por `can()`: el dueño del carnet son la persona y sus responsables
 * familiares (permiso `identity:card.view:self`); quien tenga el permiso completo ve cualquiera.
 */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para ver el carnet', 401);
  const personId = new URL(request.url).searchParams.get('persona') ?? session.personId;
  const owners = [personId, ...(await guardiansOf(getPrisma(), personId))];
  if (!(await authorize(session.personId, 'identity:card.view', { scopes: [], ownerPersonIds: owners })).allowed) {
    return errorResponse('forbidden', 'No podés ver este carnet', 403);
  }
  const card = await getCredentials().memberCard(personId);
  if (!card) return errorResponse('not_found', 'Persona inexistente', 404);
  return NextResponse.json(card, { headers: { 'cache-control': 'no-store' } });
}
