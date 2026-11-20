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

export type DenyReason = 'formato' | 'desconocida' | 'vencido' | 'revocada' | 'sin_membresia' | 'firma' | 'no_habilitada';
/** `personId` es interno (para registrar el intento): las rutas no lo devuelven. */
export type ValidationResult =
  | { valid: true; credentialId: string; personId: string; kind: CredentialKind; person: { firstName: string; lastName: string }; detail: string }
  | { valid: false; reason: DenyReason; message: string; credentialId?: string; personId?: string; person?: { firstName: string; lastName: string } };

const REASONS = {
  formato: 'El código no es de este club.',
  desconocida: 'Credencial desconocida.',
  vencido: 'El código venció: pedí que actualice el carnet.',
  revocada: 'Credencial revocada.',
  sin_membresia: 'Sin membresía vigente.',
  firma: 'El código no es válido.',
  no_habilitada: 'Todavía no está habilitada.',
} as const;

const clubHhmm = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' });

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
      return db.credential.create({ data: { personId, kind: 'member_card', validFrom: now(), secret: randomBytes(32).toString('base64url') } });
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
      const fail = (reason: DenyReason, person?: { firstName: string; lastName: string }, ids?: { credentialId: string; personId: string }, message?: string): ValidationResult => ({ valid: false, reason, message: message ?? REASONS[reason], ...(ids ?? {}), ...(person ? { person } : {}) });
      const parts = token.trim().split('.');
      if (parts.length !== 4 || parts[0] !== 'C1' || !/^\d+$/.test(parts[2] ?? '')) return fail('formato');
      const [, id, w, mac] = parts as [string, string, string, string];
      const credential = await db.credential.findUnique({
        where: { id },
        include: { person: { select: { firstName: true, lastName: true, memberships: { orderBy: { validFrom: 'desc' }, take: 1, include: { category: true } } } } },
      });
      if (!credential) return fail('desconocida');
      const person = { firstName: credential.person.firstName, lastName: credential.person.lastName };
      const ids = { credentialId: credential.id, personId: credential.personId };
      const at = now();
      const window = Number(w);
      const current = windowOf(at);
      if (window > current || window < current - TOLERANCE_WINDOWS) return fail('vencido', person);
      const expected = Buffer.from(sign(credential.secret, credential.id, window));
      const given = Buffer.from(mac);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fail('firma');
      return checkCredential(credential, at, person, ids);
    },

    /**
     * Validación sin QR (Recepción busca a la persona): el carnet social vigente de esa persona.
     * Mismas reglas y mismos motivos que el QR.
     */
    async validatePerson(personId: string): Promise<ValidationResult> {
      const p = await db.person.findUnique({ where: { id: personId }, select: { id: true, firstName: true, lastName: true, memberships: { orderBy: { validFrom: 'desc' }, take: 1, include: { category: true } } } });
      if (!p) return { valid: false, reason: 'desconocida', message: REASONS.desconocida };
      const person = { firstName: p.firstName, lastName: p.lastName };
      const at = now();
      const credential = await db.credential.findFirst({ where: { personId, kind: 'member_card' }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
      if (!credential) return { valid: false, reason: 'sin_membresia', message: REASONS.sin_membresia, personId, person };
      return checkCredential({ ...credential, person: p }, at, person, { credentialId: credential.id, personId });
    },

    /**
     * Credencial de una reserva: el QR vale desde `validFrom` hasta `validTo` y muestra `label` en
     * Recepción. Una por reserva (idempotente): si ya existe, se actualiza la ventana.
     */
    async issueBookingCredential(input: { bookingId: string; personId: string; validFrom: Date; validTo: Date; label: string }) {
      const data = { personId: input.personId, validFrom: input.validFrom, validTo: input.validTo, label: input.label.slice(0, 120) };
      return db.credential.upsert({
        where: { bookingId: input.bookingId },
        create: { ...data, kind: 'booking', bookingId: input.bookingId, secret: randomBytes(32).toString('base64url') },
        update: data,
      });
    },

    /** Revoca la credencial de una reserva (cancelada, liberada o con conflicto). No falla si no hay. */
    async revokeBookingCredential(bookingId: string, reason: string) {
      await db.credential.updateMany({ where: { bookingId, status: 'active' }, data: { status: 'revoked', revokedAt: now(), revokedReason: reason } });
    },

    /** QR vigente de la credencial de una reserva (null si no hay o no está activa). */
    async bookingQr(bookingId: string) {
      const c = await db.credential.findUnique({ where: { bookingId } });
      if (!c || c.status !== 'active') return null;
      const at = now();
      return { ...qrTokenFor(c, at), validFrom: c.validFrom, validTo: c.validTo };
    },
  };
}

type CredentialToCheck = {
  status: string;
  kind: CredentialKind;
  validFrom: Date;
  validTo: Date | null;
  label: string | null;
  person: { memberships: Array<{ status: string; validFrom: Date; validTo: Date | null; memberNumber: string | null; category: { name: string } }> };
};

/** Reglas comunes del QR y de la búsqueda: revocada, fuera de ventana, membresía vigente. */
function checkCredential(credential: CredentialToCheck, at: Date, person: { firstName: string; lastName: string }, ids: { credentialId: string; personId: string }): ValidationResult {
  const deny = (reason: DenyReason, message: string = REASONS[reason]): ValidationResult => ({ valid: false, reason, message, ...ids, person });
  if (credential.status === 'revoked') return deny('revocada');
  if (credential.status === 'expired' || (credential.validTo && credential.validTo < at)) return deny('vencido', credential.kind === 'member_card' ? REASONS.vencido : 'Venció el horario de esta credencial.');
  if (credential.validFrom > at) return deny('no_habilitada', `Todavía no está habilitada: vale desde ${clubHhmm.format(credential.validFrom)}.`);
  if (credential.kind === 'member_card') {
    const membership = credential.person.memberships[0];
    if (!membershipActive(membership, at)) return deny('sin_membresia');
    return { valid: true, ...ids, kind: credential.kind, person, detail: `Socio N° ${membership!.memberNumber ?? '—'} · ${membership!.category.name}` };
  }
  return { valid: true, ...ids, kind: credential.kind, person, detail: credential.label ?? credential.kind };
}

export type CredentialService = ReturnType<typeof createCredentialService>;
