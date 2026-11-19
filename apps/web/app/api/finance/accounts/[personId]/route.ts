import { accountFor } from '@clumera/finance';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { canViewAccount } from '@/lib/finance-access';
import { errorResponse } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Cuenta de una persona (sola). La propia y la de los representados, o con permiso completo. */
export async function GET(_request: Request, { params }: { params: Promise<{ personId: string }> }) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const { personId } = await params;
  if (!(await canViewAccount(session.personId, personId))) return errorResponse('forbidden', 'No podés ver esta cuenta', 403);
  return NextResponse.json(await accountFor(getPrisma(), personId, new Date(), [personId]), { headers: { 'cache-control': 'no-store' } });
}
