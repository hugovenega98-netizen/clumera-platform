import { RATE_RULES } from '@clumera/identity';
import { z } from 'zod';
import { meta, withSession } from '@/lib/auth-routes';
import { clientIp, domainErrorResponse, parseJson, rateLimited } from '@/lib/http';
import { getAuth } from '@/lib/services';

const schema = z.object({ token: z.string().min(10).max(100), password: z.string().min(1).max(200) });

export async function POST(request: Request) {
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const limited = await rateLimited(RATE_RULES.tokenUseByIp, clientIp(request));
  if (limited) return limited;
  const r = await getAuth().activate(body.data.token, body.data.password, meta(request));
  return r.ok ? withSession(r.value) : domainErrorResponse(r.error);
}
