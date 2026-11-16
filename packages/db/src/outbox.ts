import type { DomainEvent } from '@clumera/kernel';
import type { Prisma } from './generated/client';

/**
 * Guarda un evento de dominio en la misma transacción que el cambio que lo origina.
 * Si la transacción se revierte, el evento no existe; si se confirma, se entrega al menos una vez.
 */
export async function appendOutbox(tx: Prisma.TransactionClient, event: DomainEvent): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      id: event.id,
      type: event.type,
      source: event.source,
      payload: event.payload as Prisma.InputJsonValue,
      occurredAt: new Date(event.occurredAt),
    },
  });
}
