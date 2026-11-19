import 'server-only';
import { guestTicketAllows, readGuestTicket } from '@clumera/sports';
import { cookies } from 'next/headers';
import { getPrisma } from './db';
import { docPepper } from './people-api';

/** Cookie del invitado al minuto a minuto: firmada, httpOnly, 12 h como máximo, un partido. */
export const GUEST_COOKIE = 'cx_guest_match';

/** Clave para pases de invitado: el pepper de la instalación (los hashes nunca se leen fuera). */
export const guestKey = (): string | null => {
  const p = docPepper();
  return p && p.length >= 16 ? p : null;
};

export async function guestAllowed(matchId: string): Promise<boolean> {
  const key = guestKey();
  if (!key) return false;
  const ticket = readGuestTicket((await cookies()).get(GUEST_COOKIE)?.value, key);
  return guestTicketAllows(getPrisma(), matchId, ticket);
}
