import 'server-only';
import type { ModuleId } from '@clumera/kernel';
import { NextResponse } from 'next/server';
import { getLicenseState } from './license';
import { moduleNotLicensedBody } from './module-guard';

/** Segunda barrera dentro de cada Route Handler de módulo. Devuelve una respuesta 403 si está apagado. */
export async function requireModule(moduleId: ModuleId): Promise<NextResponse | null> {
  const { enabled } = await getLicenseState();
  return enabled.has(moduleId) ? null : NextResponse.json(moduleNotLicensedBody(moduleId), { status: 403 });
}
