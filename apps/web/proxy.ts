import { catalog } from '@clumera/catalog';
import { NextResponse, type NextRequest } from 'next/server';
import { getLicenseState } from '@/lib/license';
import { decideModuleAccess, moduleNotLicensedBody } from '@/lib/module-guard';

/** Primera barrera: corta en el borde toda ruta de un módulo sin licencia. */
export async function proxy(request: NextRequest) {
  const { enabled } = await getLicenseState();
  const decision = decideModuleAccess(request.nextUrl.pathname, catalog, enabled);
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
