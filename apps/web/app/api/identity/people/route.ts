import { registerPerson, searchPeople, type PeopleFilter } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { docPepper, guard } from '@/lib/people-api';

export const dynamic = 'force-dynamic';

const FILTERS = ['all', 'members', 'non_members', 'minors', 'staff'] as const;

/** Padrón: búsqueda por nombre, N° de socio o documento. Requiere identity:person.view. */
export async function GET(request: Request) {
  const g = await guard('identity:person.view', 'No tenés permiso para ver el padrón');
  if (!g.ok) return g.response;
  const params = new URL(request.url).searchParams;
  const filter = (FILTERS as readonly string[]).includes(params.get('filtro') ?? '') ? (params.get('filtro') as PeopleFilter) : 'all';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const result = await searchPeople(getPrisma(), { q: params.get('q')?.slice(0, 100) ?? '', filter, page, pepper: docPepper() });
  return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const schema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  document: optional(20),
  birthDate: z.iso.date().optional().or(z.literal('')),
  email: z.email().max(200).optional().or(z.literal('')),
  phone: optional(40),
  categoryCode: optional(40),
  memberNumber: optional(9),
});

/** Alta de persona (y membresía social, si se indica categoría). Requiere identity:person.manage. */
export async function POST(request: Request) {
  const g = await guard('identity:person.manage', 'No tenés permiso para dar altas');
  if (!g.ok) return g.response;
  const body = await parseJson(request, schema);
  if (!body.ok) return body.response;
  const d = body.data;
  const r = await registerPerson(
    getPrisma(),
    g.session.personId,
    {
      firstName: d.firstName,
      lastName: d.lastName,
      document: d.document,
      birthDate: d.birthDate ? new Date(`${d.birthDate}T00:00:00Z`) : null,
      email: d.email || null,
      phone: d.phone,
      membership: d.categoryCode ? { categoryCode: d.categoryCode, memberNumber: d.memberNumber } : null,
    },
    docPepper(),
  );
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
