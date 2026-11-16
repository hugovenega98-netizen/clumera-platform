import { catalog } from '@clumera/catalog';
import { NextResponse, type NextRequest } from 'next/server';
import { getLicenseState } from '@/lib/license';
import { decideModuleAccess, moduleNotLicensedBody } from '@/lib/module-guard';
import { isCrossOriginWrite } from '@/lib/origin-check';

/**
 * Primera barrera:
 * 1. Escrituras en la API solo desde el mismo origen (CSRF).
 * 2. Toda ruta de un módulo sin licencia se corta acá (y de nuevo en su Route Handler).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (isCrossOriginWrite(request.method, pathname, request.headers.get('origin'), host))
    return NextResponse.json({ error: { code: 'forbidden', message: 'Origen no permitido' } }, { status: 403 });

  const { enabled } = await getLicenseState();
  const decision = decideModuleAccess(pathname, catalog, enabled);
  if (decision.action === 'deny-api') return NextResponse.json(moduleNotLicensedBody(decision.moduleId), { status: 403 });
  if (decision.action === 'deny-page') {
    const url = request.nextUrl.clone();
    url.pathname = '/modulo-no-disponible';
    url.search = '';
    return NextResponse.rewrite(url, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  // Todo menos estáticos, el service worker y el manifiesto.
  matcher: ['/((?!_next/|serwist/|icons/|branding/|manifest.webmanifest|favicon.ico|robots.txt).*)'],
};
