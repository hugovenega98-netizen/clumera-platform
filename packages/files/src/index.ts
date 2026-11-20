/**
 * Archivos (servicio compartido): documentos que suben las familias (apto físico, DNI, autorizaciones).
 * Se guardan en la base: metadatos en `FileObject`, contenido aparte en `FileBlob`. El tipo se decide
 * por el contenido (firma del archivo), nunca por lo que dice el navegador. Quién puede leerlo lo
 * decide quien lo usa (el módulo), con `sensitive` para datos de salud.
 */
import type { PrismaClient } from '@clumera/db';
import { DomainError, type Result } from '@clumera/kernel';
import { createHash } from 'node:crypto';

/** 4 MB: el cuerpo de una función de Vercel admite hasta 4,5 MB. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string) => ({ ok: false, error: new DomainError(code, message) }) as const;

/** Tipos aceptados, por su firma. */
export function detectType(bytes: Uint8Array): { contentType: string; ext: string } | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { contentType: 'application/pdf', ext: 'pdf' };
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { contentType: 'image/png', ext: 'png' };
  if (starts(0xff, 0xd8, 0xff)) return { contentType: 'image/jpeg', ext: 'jpg' };
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return { contentType: 'image/webp', ext: 'webp' };
  return null;
}

/** Nombre seguro para mostrar y descargar: sin rutas ni caracteres de control, con la extensión real. */
export function safeFilename(name: string, ext: string): string {
  const base = (name.split(/[\\/]/).pop() ?? '')
    .replace(/\.[^.]*$/, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .trim()
    .slice(0, 80);
  return `${base || 'documento'}.${ext}`;
}

export interface StoreInput {
  ownerPersonId: string;
  uploadedById: string;
  purpose: string;
  filename: string;
  bytes: Uint8Array;
  sensitive: boolean;
}

export async function storeFile(db: PrismaClient, input: StoreInput): Promise<Result<{ id: string; filename: string; contentType: string; size: number }>> {
  if (!input.bytes.length) return fail('invalid_input', 'El archivo está vacío');
  if (input.bytes.length > MAX_FILE_BYTES) return fail('invalid_input', 'El archivo supera los 4 MB');
  const type = detectType(input.bytes);
  if (!type) return fail('invalid_input', 'Subí un PDF o una foto (JPG, PNG o WEBP)');
  const filename = safeFilename(input.filename, type.ext);
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const f = await db.fileObject.create({
    data: {
      ownerPersonId: input.ownerPersonId,
      uploadedById: input.uploadedById,
      purpose: input.purpose.slice(0, 60),
      filename,
      contentType: type.contentType,
      size: input.bytes.length,
      sha256,
      sensitive: input.sensitive,
      blob: { create: { data: Buffer.from(input.bytes) } },
    },
  });
  return { ok: true, value: { id: f.id, filename, contentType: f.contentType, size: f.size } };
}

/** Metadatos de un archivo (sin contenido). */
export async function fileInfo(db: PrismaClient, id: string) {
  return db.fileObject.findUnique({ where: { id }, select: { id: true, ownerPersonId: true, purpose: true, filename: true, contentType: true, size: true, sensitive: true, createdAt: true } });
}

/** Contenido de un archivo. El que llama ya decidió que la persona puede leerlo. */
export async function fileContent(db: PrismaClient, id: string) {
  const b = await db.fileBlob.findUnique({ where: { fileId: id }, select: { data: true } });
  return b ? new Uint8Array(b.data) : null;
}
