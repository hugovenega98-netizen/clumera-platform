/**
 * Protección CSRF para la API: toda escritura (POST, PUT, PATCH, DELETE) tiene que venir del
 * mismo origen. Las cookies ya son SameSite=Lax; esto cubre además formularios de otros sitios.
 * Webhooks y cron se autentican con su propio secreto.
 */
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT = ['/api/webhooks/', '/api/cron/'];

export function isCrossOriginWrite(method: string, pathname: string, origin: string | null, host: string | null): boolean {
  if (!UNSAFE.has(method.toUpperCase()) || !pathname.startsWith('/api/')) return false;
  if (EXEMPT.some((p) => pathname.startsWith(p))) return false;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
