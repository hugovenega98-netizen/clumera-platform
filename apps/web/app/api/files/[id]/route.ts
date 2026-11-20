import { fileContent, fileInfo } from '@clumera/files';
import { permissionChecker } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { getCurrentSession } from '@/lib/session';
import { actsFor } from '@/lib/sports-access';

/**
 * Descargar un archivo. Lo ve la persona dueña (o su responsable) y la coordinación del módulo que
 * lo pidió; un archivo sensible (salud) pide además el permiso propio. Nunca se muestra en línea:
 * se descarga, sin que el navegador adivine el tipo.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const db = getPrisma();
  const info = await fileInfo(db, (await params).id);
  // Inexistente o ajeno: la misma respuesta, para no revelar archivos de otros.
  const notFound = () => errorResponse('not_found', 'Archivo inexistente', 404);
  if (!info) return notFound();
  const can = await permissionChecker(session.personId);
  const family = await actsFor(session.personId, info.ownerPersonId);
  const staff = info.purpose.startsWith('colonia:') && can('summer:manage') && (!info.sensitive || can('summer:document.sensitive.view'));
  if (!family && !staff) return notFound();
  const data = await fileContent(db, info.id);
  if (!data) return notFound();
  await db.auditLog.create({ data: { actorPersonId: session.personId, action: 'file.downloaded', entityType: 'person', entityId: info.ownerPersonId, diff: { fileId: info.id, purpose: info.purpose } } });
  return new Response(data, {
    headers: {
      'content-type': info.contentType,
      'content-length': String(info.size),
      'content-disposition': `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'private, no-store',
    },
  });
}
