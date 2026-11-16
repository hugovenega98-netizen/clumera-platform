import { RATE_RULES } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { meta } from '@/lib/auth-routes';
import { clientIp, parseJson, rateLimited } from '@/lib/http';
import { getAuth } from '@/lib/services';

const schema = z.object({ login: z.string().min(1).max(200) });

/** Siempre responde lo mismo: no revela si la cuenta existe. */
export async function POST(request: Request) {
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const limited =
    (await rateLimited(RATE_RULES.resetRequestByIp, clientIp(request))) ??
    (await rateLimited(RATE_RULES.resetRequestByLogin, body.data.login.trim().toLowerCase()));
  if (limited) return limited;
  await getAuth().requestPasswordReset(body.data.login, meta(request));
  return NextResponse.json({ ok: true, message: 'Si el usuario existe, te mandamos un enlace por correo.' });
}
