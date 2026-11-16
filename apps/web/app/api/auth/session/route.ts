import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getCurrentSession();
  if (!s) return NextResponse.json({ authenticated: false });
  return NextResponse.json({
    authenticated: true,
    person: { id: s.personId, firstName: s.firstName, lastName: s.lastName },
    login: s.login,
    activeContext: s.activeContext,
  });
}
