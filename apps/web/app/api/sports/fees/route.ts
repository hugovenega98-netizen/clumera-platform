import { issueCharge, periodLabel } from '@clumera/finance';
import { teamFeeRows } from '@clumera/sports';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { permissionChecker } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { errorResponse, parseJson } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';

/**
 * Aranceles del mes: un cargo por jugador de cada equipo con arancel, en Finanzas, agrupado por
 * deporte y equipo. Idempotente. Requiere sports:manage y finance:charge.issue.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const can = await permissionChecker(session.personId);
  if (!can('sports:manage') || !can('finance:charge.issue')) return errorResponse('forbidden', 'No tenés permiso para emitir aranceles', 403);
  const body = await parseJson(request, z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), dueDay: z.number().int().min(1).max(28).default(10) }));
  if (!body.ok) return body.response;
  const db = getPrisma();
  const [y, m] = body.data.period.split('-').map(Number) as [number, number];
  let issued = 0;
  let skipped = 0;
  for (const row of await teamFeeRows(db, body.data.period)) {
    const r = await issueCharge(db, session.personId, {
      personId: row.personId,
      concept: 'arancel',
      groupLabel: row.groupLabel,
      description: `Arancel ${periodLabel(body.data.period).toLowerCase()}`,
      period: body.data.period,
      amount: row.amount,
      dueDate: new Date(Date.UTC(y, m - 1, body.data.dueDay)),
      source: 'sports',
      sourceRef: row.sourceRef,
    });
    if (!r.ok) return errorResponse(r.error.code, r.error.message, r.error.httpStatus);
    if (r.value.created) issued++;
    else skipped++;
  }
  return NextResponse.json({ issued, skipped });
}
