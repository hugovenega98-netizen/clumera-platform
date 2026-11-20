import { RATE_RULES, searchPeople } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { guardAccess } from '@/lib/access';
import { getPrisma } from '@/lib/db';
import { rateLimited } from '@/lib/http';
import { docPepper } from '@/lib/people-api';

/**
 * Búsqueda de Recepción (nombre, DNI o N° de socio): solo nombre y número, para elegir a quién
 * validar. Nada de contacto, deuda ni salud.
 */
export async function GET(request: Request) {
  const g = await guardAccess('access:validate');
  if (!g.ok) return g.response;
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ items: [] });
  const limited = await rateLimited(RATE_RULES.accessSearchByAccount, g.session.personId);
  if (limited) return limited;
  const found = await searchPeople(getPrisma(), { q, pepper: docPepper() });
  return NextResponse.json(
    { items: found.items.slice(0, 8).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, memberNumber: p.memberNumber ?? null })) },
    { headers: { 'cache-control': 'no-store' } },
  );
}
