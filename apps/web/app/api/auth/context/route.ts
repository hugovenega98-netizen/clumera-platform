import { loadActor, spacesFor } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { errorResponse, parseJson } from '@/lib/http';
import { getAuth } from '@/lib/services';
import { getCurrentSession } from '@/lib/session';

/** Cambia el espacio activo de la sesión. Solo a un espacio que la persona tiene. */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const body = await parseJson(request, z.object({ key: z.string().min(1).max(200) }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const space = (await spacesFor(db, await loadActor(db, session.personId))).find((s) => s.key === body.data.key);
  if (!space) return errorResponse('forbidden', 'Ese espacio no es tuyo', 403);
  await getAuth().switchContext(session.sessionId, space.key);
  return NextResponse.json({ ok: true, home: space.home });
}
