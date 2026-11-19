/**
 * Credenciales y QR rotativo.
 *
 * El QR muestra `C1.<id>.<ventana>.<firma>`: el id de la credencial (opaco), la ventana de 30 s y una
 * firma HMAC con la clave propia de la credencial. No lleva nombre, documento ni número de socio: una
 * foto del QR no revela a la persona y vence en menos de un minuto.
 *
 * Validar responde solo validez y motivo, con el nombre para que Recepción reconozca a la persona.
 * Nunca deuda ni salud.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { CredentialKind, PrismaClient } from '@clumera/db';

export const QR_WINDOW_SECONDS = 30;
/** Ventanas aceptadas hacia atrás: tolera relojes desfasados y la demora al escanear. */
const TOLERANCE_WINDOWS = 1;

const windowOf = (at: Date) => Math.floor(at.getTime() / 1000 / QR_WINDOW_SECONDS);

function sign(secret: string, credentialId: string, window: number): string {
  return createHmac('sha256', Buffer.from(secret, 'base64url')).update(`${credentialId}.${window}`).digest('base64url').slice(0, 16);
}

export function qrTokenFor(credential: { id: string; secret: string }, at = new Date()): { token: string; expiresAt: Date } {
  const w = windowOf(at);
  return {
    token: `C1.${credential.id}.${w}.${sign(credential.secret, credential.id, w)}`,
    expiresAt: new Date((w + 1) * QR_WINDOW_SECONDS * 1000),
  };
}

export type ValidationResult =
  | { valid: true; credentialId: string; kind: CredentialKind; person: { firstName: string; lastName: string }; detail: string }
  | { valid: false; reason: 'formato' | 'desconocida' | 'vencido' | 'revocada' | 'sin_membresia' | 'firma'; message: string; person?: { firstName: string; lastName: string } };

const REASONS = {
  formato: 'El código no es de este club.',
  desconocida: 'Credencial desconocida.',
  vencido: 'El código venció: pedí que actualice el carnet.',
  revocada: 'Credencial revocada.',
  sin_membresia: 'Sin membresía vigente.',
  firma: 'El código no es válido.',
} as const;

/** Membresía vigente: activa y dentro de sus fechas. */
export function membershipActive(m: { status: string; validFrom: Date; validTo: Date | null } | undefined, at: Date) {
  return Boolean(m && m.status === 'active' && m.validFrom <= at && (!m.validTo || m.validTo >= at));
}

export function createCredentialService(db: PrismaClient, now: () => Date = () => new Date()) {
  return {
    /** Carnet social de la persona: lo crea si tiene membresía y todavía no tiene uno activo. */
    async ensureMemberCard(personId: string) {
      const existing = await db.credential.findFirst({ where: { personId, kind: 'member_card', status: 'active' } });
      if (existing) return existing;
      return db.credential.create({ data: { personId, kind: 'member_card', secret: randomBytes(32).toString('base64url') } });
    },

    async revoke(credentialId: string, reason: string) {
      await db.credential.update({ where: { id: credentialId }, data: { status: 'revoked', revokedAt: now(), revokedReason: reason } });
    },

    /** Vista del carnet para la persona (o su responsable): datos visibles + QR vigente. */
    async memberCard(personId: string) {
      const person = await db.person.findUnique({
        where: { id: personId },
        include: { memberships: { include: { category: true }, orderBy: { validFrom: 'desc' } } },
      });
      if (!person) return null;
      const membership = person.memberships[0];
      const at = now();
      const active = membershipActive(membership, at);
      const credential = membership ? await this.ensureMemberCard(personId) : null;
      return {
        person: { id: person.id, firstName: person.firstName, lastName: person.lastName },
        membership: membership
          ? { number: membership.memberNumber, category: membership.category.name, status: membership.status, validTo: membership.validTo, active }
          : null,
        qr: credential && active ? qrTokenFor(credential, at) : null,
      };
    },

    /** Validación en un punto de acceso. Solo validez, motivo y el nombre. */
    async validate(token: string): Promise<ValidationResult> {
      const fail = (reason: keyof typeof REASONS, person?: { firstName: string; lastName: string }): ValidationResult => ({ valid: false, reason, message: REASONS[reason], ...(person ? { person } : {}) });
      const parts = token.trim().split('.');
      if (parts.length !== 4 || parts[0] !== 'C1' || !/^\d+$/.test(parts[2] ?? '')) return fail('formato');
      const [, id, w, mac] = parts as [string, string, string, string];
      const credential = await db.credential.findUnique({
        where: { id },
        include: { person: { select: { firstName: true, lastName: true, memberships: { orderBy: { validFrom: 'desc' }, take: 1, include: { category: true } } } } },
      });
      if (!credential) return fail('desconocida');
      const person = { firstName: credential.person.firstName, lastName: credential.person.lastName };
      const at = now();
      const window = Number(w);
      const current = windowOf(at);
      if (window > current || window < current - TOLERANCE_WINDOWS) return fail('vencido', person);
      const expected = Buffer.from(sign(credential.secret, credential.id, window));
      const given = Buffer.from(mac);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fail('firma');
      if (credential.status === 'revoked') return fail('revocada', person);
      if (credential.status === 'expired' || (credential.validTo && credential.validTo < at)) return fail('vencido', person);
      const membership = credential.person.memberships[0];
      if (credential.kind === 'member_card') {
        if (!membershipActive(membership, at)) return fail('sin_membresia', person);
        return { valid: true, credentialId: credential.id, kind: credential.kind, person, detail: `Socio N° ${membership!.memberNumber ?? '—'} · ${membership!.category.name}` };
      }
      return { valid: true, credentialId: credential.id, kind: credential.kind, person, detail: credential.kind };
    },
  };
}

export type CredentialService = ReturnType<typeof createCredentialService>;
