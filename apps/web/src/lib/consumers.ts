import 'server-only';
import { processOutbox, type OutboxConsumer, type PrismaClient } from '@clumera/db';
import { formatMoney, receiptNumber } from '@clumera/finance';
import { bookingTitle, confirmPaidBookings } from '@clumera/module-bookings';
import { deliverPendingPush, notify, vapidFromEnv } from '@clumera/notifications';
import { eventNotice, matchAudience } from '@clumera/sports';

/**
 * Consumidores del outbox de la app: cada módulo reacciona a eventos de otros sin importarlos.
 * Finanzas → Avisos: «pago acreditado» a quien pagó.
 * Deportes → Avisos: cada incidencia a convocados, sus responsables y seguidores; y un aviso genérico
 * (sin datos clínicos) cuando Médico/Kine actualiza un seguimiento.
 * Finanzas → Reservas: un pago acreditado confirma la reserva del cargo (o la deja en conflicto si
 * el turno ya lo tomó otro). Reservas → Avisos: confirmada, liberada por falta de pago, cancelada por el club.
 */
export const consumers: OutboxConsumer[] = [
  {
    name: 'bookings:payment-approved',
    types: ['payment.approved'],
    async handle(event, tx) {
      const p = event.payload as { chargeIds?: string[] };
      await confirmPaidBookings(tx, p.chargeIds ?? []);
    },
  },
  {
    name: 'notifications:booking',
    types: ['booking.confirmed', 'booking.released', 'booking.conflict', 'booking.cancelled'],
    async handle(event, tx) {
      const p = event.payload as { bookingId: string; personId: string; byManager?: boolean };
      // La persona que cancela no necesita aviso: solo cuando cancela el club.
      if (event.type === 'booking.cancelled' && !p.byManager) return;
      const b = await tx.booking.findUnique({ where: { id: p.bookingId }, select: { startsAt: true, venue: { select: { name: true } } } });
      if (!b) return;
      const title = bookingTitle(b.venue.name, b.startsAt);
      const text: Record<string, [string, string]> = {
        'booking.confirmed': ['Reserva confirmada', title],
        'booking.released': ['Se liberó tu turno', `${title}: venció el tiempo para pagar.`],
        'booking.conflict': ['Tu pago llegó tarde', `${title}: el turno ya estaba tomado. El club te devuelve lo pagado.`],
        'booking.cancelled': ['El club canceló tu reserva', title],
      };
      const [t, body] = text[event.type]!;
      await notify(tx, { personIds: [p.personId], eventKey: `${event.type}:${p.bookingId}`, source: 'bookings', title: t, body, url: '/reservas?vista=mias' });
    },
  },
  {
    name: 'notifications:payment-approved',
    types: ['payment.approved'],
    async handle(event, tx) {
      const p = event.payload as { paymentId: string; payerPersonId: string | null; amount: number };
      if (!p.payerPersonId) return;
      const payment = await tx.payment.findUnique({ where: { id: p.paymentId }, select: { number: true } });
      await notify(tx, {
        personIds: [p.payerPersonId],
        eventKey: `payment.approved:${p.paymentId}`,
        source: 'finance',
        title: 'Pago acreditado',
        body: `Recibimos ${formatMoney(p.amount)}${payment ? ` · comprobante ${receiptNumber(payment.number)}` : ''}.`,
        url: `/pagos/comprobante/${p.paymentId}`,
      });
    },
  },
  {
    name: 'notifications:match-event',
    types: ['match.event_recorded'],
    async handle(event, tx) {
      const p = event.payload as { matchId: string; eventId: string };
      const notice = await eventNotice(tx, p.matchId, p.eventId);
      if (!notice) return; // deshecha antes de entregarse
      await notify(tx, { personIds: await matchAudience(tx, p.matchId), eventKey: `match.event:${p.eventId}`, source: 'sports', ...notice });
    },
  },
  {
    name: 'notifications:injury-evaluated',
    types: ['injury.evaluated'],
    async handle(event, tx) {
      const p = event.payload as { reportId: string; personId: string };
      const guardians = await tx.familyRelationship.findMany({ where: { role: 'guardian', group: { members: { some: { personId: p.personId, role: 'dependent' } } } }, select: { personId: true } });
      await notify(tx, {
        personIds: [p.personId, ...guardians.map((g) => g.personId)],
        eventKey: `injury.evaluated:${event.id}`,
        source: 'sports',
        title: 'Seguimiento actualizado',
        body: 'Hay una novedad en un seguimiento de salud. Entrá para verla.',
        url: '/deportes/salud',
      });
    },
  },
];

/** Entrega inmediata (después de responder): eventos del outbox y push pendientes. Idempotente. */
export async function deliverNow(db: PrismaClient): Promise<void> {
  // Un evento puede generar otro (pago → reserva confirmada → aviso): unas pocas pasadas en cadena.
  for (let pass = 0; pass < 3; pass++) {
    const r = await processOutbox(db, consumers);
    if (!r.published) break;
  }
  const vapid = vapidFromEnv();
  if (vapid) await deliverPendingPush(db, vapid);
}
