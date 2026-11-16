import { familyView } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  return NextResponse.json({ groups: await familyView(getPrisma(), session.personId) });
}
