import { RATE_RULES } from '@clumera/identity';
import { z } from 'zod';
import { meta, safeNext, withSession } from '@/lib/auth-routes';
import { clientIp, domainErrorResponse, parseJson, rateLimited } from '@/lib/http';
import { getAuth } from '@/lib/services';

const schema = z.object({ login: z.string().min(1).max(200), password: z.string().min(1).max(200), next: z.string().max(500).optional() });

export async function POST(request: Request) {
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const ip = clientIp(request);
  const limited =
    (await rateLimited(RATE_RULES.loginByIp, ip)) ?? (await rateLimited(RATE_RULES.loginByAccount, body.data.login.trim().toLowerCase()));
  if (limited) return limited;
  const r = await getAuth().login(body.data.login, body.data.password, meta(request));
  if (!r.ok) return domainErrorResponse(r.error);
  return withSession(r.value, { ok: true, next: safeNext(body.data.next) });
}
