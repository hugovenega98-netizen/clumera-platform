import { updatePerson } from '@clumera/identity';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { domainErrorResponse, parseJson } from '@/lib/http';
import { docPepper, guard } from '@/lib/people-api';

const text = (max: number) => z.string().trim().max(max);

/** Corregir datos de una persona. El documento solo se reemplaza (digest + últimos 4). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard('identity:person.manage', 'No tenés permiso para editar personas');
  if (!g.ok) return g.response;
  const body = await parseJson(
    request,
    z.object({
      firstName: text(80).min(1).optional(),
      lastName: text(80).min(1).optional(),
      document: text(20).optional(),
      birthDate: z.iso.date().or(z.literal('')).optional(),
      email: z.email().max(200).or(z.literal('')).optional(),
      phone: text(40).optional(),
    }),
  );
  if (!body.ok) return body.response;
  const d = body.data;
  const r = await updatePerson(
    getPrisma(),
    g.session.personId,
    (await params).id,
    { ...d, birthDate: d.birthDate === undefined ? undefined : d.birthDate ? new Date(`${d.birthDate}T00:00:00Z`) : null, email: d.email === undefined ? undefined : d.email || null, phone: d.phone === undefined ? undefined : d.phone || null },
    docPepper(),
  );
  return r.ok ? NextResponse.json(r.value) : domainErrorResponse(r.error);
}
