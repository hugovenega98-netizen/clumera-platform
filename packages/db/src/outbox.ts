import type { DomainEvent } from '@clumera/kernel';
import type { Prisma, PrismaClient } from './generated/client';

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

export interface OutboxConsumer {
  /** Nombre estable: con él se registra qué eventos ya procesó. */
  name: string;
  /** Tipos que escucha; `*` = todos. */
  types: string[];
  handle(event: DomainEvent, tx: Prisma.TransactionClient): Promise<void>;
}

export interface OutboxRunResult {
  published: number;
  failed: number;
}

const MAX_ATTEMPTS = 10;

/**
 * Entrega los eventos pendientes a sus consumidores. Cada consumidor procesa cada evento una
 * sola vez (ProcessedEvent en la misma transacción que su efecto). Un evento queda publicado
 * cuando todos sus consumidores terminaron; si alguno falla, se reintenta en la próxima corrida.
 */
export async function processOutbox(db: PrismaClient, consumers: OutboxConsumer[], limit = 50): Promise<OutboxRunResult> {
  const pending = await db.outboxEvent.findMany({
    where: { publishedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { occurredAt: 'asc' },
    take: limit,
  });
  let published = 0;
  let failed = 0;
  for (const row of pending) {
    const event: DomainEvent = {
      id: row.id,
      type: row.type,
      source: row.source,
      occurredAt: row.occurredAt.toISOString(),
      payload: row.payload,
    };
    try {
      for (const consumer of consumers) {
        if (!consumer.types.includes('*') && !consumer.types.includes(event.type)) continue;
        await db.$transaction(async (tx) => {
          const claimed = await tx.processedEvent.createMany({ data: [{ consumer: consumer.name, eventId: event.id }], skipDuplicates: true });
          if (claimed.count === 0) return; // ya procesado por este consumidor
          await consumer.handle(event, tx);
        });
      }
      await db.outboxEvent.update({ where: { id: row.id }, data: { publishedAt: new Date(), lastError: null } });
      published++;
    } catch (e) {
      failed++;
      await db.outboxEvent.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 }, lastError: String((e as Error).message).slice(0, 500) },
      });
    }
  }
  return { published, failed };
}
