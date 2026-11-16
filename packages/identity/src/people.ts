import type { PrismaClient } from '@clumera/db';
import { createHmac } from 'node:crypto';

/**
 * El documento nunca se guarda en claro: HMAC con una clave de la instalación (para buscar y
 * deduplicar) + últimos 4 dígitos (para mostrar).
 */
export function documentDigest(document: string, pepper: string): { docDigest: string; docLast4: string } {
  const normalized = document.replace(/[^0-9a-z]/gi, '').toUpperCase();
  if (normalized.length < 5) throw new Error('Documento demasiado corto');
  if (!pepper || pepper.length < 16) throw new Error('Falta CLUMERA_DOC_PEPPER (16+ caracteres)');
  return { docDigest: createHmac('sha256', pepper).update(normalized).digest('hex'), docLast4: normalized.slice(-4) };
}

export interface PersonInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: Date | null;
  document?: string | null;
}

/** Busca por documento antes de crear: una persona existe una sola vez por club. */
export async function findOrCreatePerson(db: PrismaClient, input: PersonInput, pepper: string) {
  const doc = input.document ? documentDigest(input.document, pepper) : null;
  if (doc) {
    const existing = await db.person.findUnique({ where: { docDigest: doc.docDigest } });
    if (existing) return { person: existing, created: false };
  }
  const person = await db.person.create({
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
      birthDate: input.birthDate ?? null,
      ...(doc ?? {}),
    },
  });
  return { person, created: true };
}
