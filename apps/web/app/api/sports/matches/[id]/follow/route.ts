import { setFollow } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

/** Seguir un partido: avisos push por cada incidencia. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'view');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ follow: z.boolean() }));
  if (!body.ok) return body.response;
  await setFollow(getPrisma(), g.match.id, g.session.personId, body.data.follow);
  return NextResponse.json({ follow: body.data.follow });
}
