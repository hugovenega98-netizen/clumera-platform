import { addMembership } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { guard } from '@/lib/people-api';

/** Alta de membresía social para una persona que no es socia (o lo fue). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('identity:person.manage', 'No tenés permiso para dar altas');
  if (!g.ok) return g.response;
  const body = await parseJson(request, z.object({ categoryCode: z.string().min(1).max(40), memberNumber: z.string().trim().max(9).optional() }));
  if (!body.ok) return body.response;
  const r = await addMembership(getPrisma(), g.session.personId, (await params).id, body.data);
  return r.ok ? NextResponse.json(r.value, { status: 201 }) : domainErrorResponse(r.error);
}
