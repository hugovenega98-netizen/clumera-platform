import { setStream } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardMatch } from '@/lib/sports-access';

/** Transmisión de YouTube del partido (el coach pega el enlace; vacío la quita). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardMatch((await params).id, 'coach');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ url: z.string().max(300).nullable() }));
  if (!body.ok) return body.response;
  const r = await setStream(getPrisma(), g.match.id, body.data.url);
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
