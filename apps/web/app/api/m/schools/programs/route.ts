import { createProgram } from '@clumera/module-schools';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guardSchools } from '@/lib/schools-access';

const money = z.number().int().min(0).max(100_000_000);
const age = z.number().int().min(0).max(99).nullable().optional();

/** Nueva propuesta de Escuelas (coordinación). Montos en centavos. */
export async function POST(request: Request) {
  const g = await guardSchools('schools:manage');
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({ slug: z.string().min(2).max(40), name: z.string().min(3).max(80), description: z.string().max(300).optional(), activity: z.string().min(2).max(40), minAge: age, maxAge: age, membersOnly: z.boolean(), memberFee: money, guestFee: money }),
  );
  if (!body.ok) return body.response;
  const r = await createProgram(getPrisma(), g.session.personId, body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
