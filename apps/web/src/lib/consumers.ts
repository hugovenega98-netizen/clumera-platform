import 'server-only';
import { processOutbox, type OutboxConsumer, type PrismaClient } from '@clumera/db';
import { formatMoney, receiptNumber } from '@clumera/finance';
import { deliverPendingPush, notify, vapidFromEnv } from '@clumera/notifications';

/**
 * Consumidores del outbox de la app: cada módulo reacciona a eventos de otros sin importarlos.
 * Finanzas → Avisos: «pago acreditado» a quien pagó.
 */
export const consumers: OutboxConsumer[] = [
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
];

/** Entrega inmediata (después de responder): eventos del outbox y push pendientes. Idempotente. */
export async function deliverNow(db: PrismaClient): Promise<void> {
  await processOutbox(db, consumers);
  const vapid = vapidFromEnv();
  if (vapid) await deliverPendingPush(db, vapid);
}
