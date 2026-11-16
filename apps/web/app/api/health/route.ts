import { NextResponse } from 'next/server';
import { clientConfig } from '@/lib/client-config';
import { getLicenseState } from '@/lib/license';

export const dynamic = 'force-dynamic';

/** Estado de la instalación para Management: versión, club y módulos encendidos. Sin datos personales. */
export async function GET() {
  const license = await getLicenseState();
  return NextResponse.json({
    status: 'ok',
    clientId: clientConfig.identity.clientId,
    version: process.env.npm_package_version ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    license: { licenseId: license.payload?.licenseId ?? null, expiresAt: license.payload?.expiresAt ?? null, problem: license.problem },
    modules: [...license.enabled].sort(),
  });
}
