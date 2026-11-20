/**
 * Reserva pública sin cuenta (lienzo «Público · reservar sin cuenta»): cualquiera reserva un espacio
 * habilitado para el público con tarifa general y paga online (completo o seña). La reserva queda a
 * nombre de una persona invitada; se gestiona con un enlace firmado que llega por correo.
 *
 * Nunca se asocia una reserva pública a un socio ni a alguien con cuenta: si el email es de uno,
 * se le pide ingresar (así no se cargan cargos en la cuenta de otra persona).
 */
import type { PrismaClient } from '@clumera/db';
import { DomainError, type Result } from '@clumera/kernel';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createBooking, isMember, type PayMode } from './bookings';

const fail = (code: ConstructorParameters<typeof DomainError>[0], message: string, details?: Record<string, unknown>) => ({ ok: false, error: new DomainError(code, message, details) }) as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface GuestInput {
  name: string;
  email: string;
  phone: string;
}

/** Persona invitada por email: reutiliza a un invitado anterior; nunca a un socio o a quien tiene cuenta. */
export async function guestPersonFor(db: PrismaClient, guest: GuestInput): Promise<Result<{ personId: string; created: boolean }>> {
  const email = guest.email.trim().toLowerCase();
  const name = guest.name.trim().replace(/\s+/g, ' ').slice(0, 120);
  const phone = guest.phone.replace(/[^\d+]/g, '').slice(0, 20);
  if (!EMAIL.test(email)) return fail('invalid_input', 'Revisá el email');
  if (name.split(' ').length < 2) return fail('invalid_input', 'Escribí nombre y apellido');
  if (phone.replace(/\D/g, '').length < 8) return fail('invalid_input', 'Revisá el celular');
  const same = await db.person.findMany({ where: { email }, select: { id: true, account: { select: { id: true } }, memberships: { select: { id: true }, take: 1 } }, take: 5 });
  const login = await db.userAccount.findUnique({ where: { login: email }, select: { id: true } });
  if (login || same.some((p) => p.account || p.memberships.length)) return fail('conflict', 'Ese email es de una persona del club: ingresá con tu cuenta para reservar con tu tarifa', { reason: 'member_email' });
  if (same[0]) return { ok: true, value: { personId: same[0].id, created: false } };
  const [first, ...rest] = name.split(' ');
  const p = await db.person.create({ data: { firstName: first!, lastName: rest.join(' '), email, phone } });
  return { ok: true, value: { personId: p.id, created: true } };
}

/** Espacios habilitados para reservar sin cuenta. */
export async function publicVenues(db: PrismaClient) {
  const venues = await db.venue.findMany({
    where: { active: true, rule: { publicBooking: true }, tariffs: { some: {} } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { rule: true, tariffs: true },
  });
  return venues.map((v) => ({ ...v, rule: v.rule! }));
}

/** Reserva pública: tarifa general, solo pago online (completo o seña). */
export async function createPublicBooking(
  db: PrismaClient,
  input: { venueId: string; startsAt: Date; payMode: Exclude<PayMode, 'club'>; guest: GuestInput },
  now = new Date(),
): Promise<Result<{ id: string; personId: string; chargeId: string | null; amount: number; holdExpiresAt: Date | null; status: 'held' | 'confirmed' }>> {
  if (input.payMode !== 'full' && input.payMode !== 'deposit') return fail('invalid_input', 'Sin cuenta se paga online');
  const rule = await db.bookingRule.findUnique({ where: { venueId: input.venueId }, select: { publicBooking: true } });
  if (!rule?.publicBooking) return fail('not_found', 'Ese espacio no se reserva sin cuenta');
  const guest = await guestPersonFor(db, input.guest);
  if (!guest.ok) return guest;
  if (await isMember(db, guest.value.personId, now)) return fail('conflict', 'Ingresá con tu cuenta para reservar con tu tarifa');
  const r = await createBooking(db, guest.value.personId, { personId: guest.value.personId, venueId: input.venueId, startsAt: input.startsAt, payMode: input.payMode, public: true }, now);
  if (!r.ok) return r;
  return { ok: true, value: { ...r.value, personId: guest.value.personId } };
}

// ───────────── Enlace firmado para gestionar la reserva ─────────────

const mac = (id: string, key: string) => createHmac('sha256', key).update(`booking-guest-v1:${id}`).digest('base64url').slice(0, 32);

/** Token del enlace de gestión: id de la reserva + firma (no vence; la reserva sí). */
export function guestBookingToken(bookingId: string, key: string): string {
  if (!key || key.length < 16) throw new Error('Falta una clave segura para enlaces de reserva');
  return `${bookingId}.${mac(bookingId, key)}`;
}

export function readGuestBookingToken(token: string, key: string): string | null {
  const [id, sig, ...extra] = token.split('.');
  if (extra.length || !id || !sig || id.length > 40 || !key || key.length < 16) return null;
  const want = Buffer.from(mac(id, key));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
