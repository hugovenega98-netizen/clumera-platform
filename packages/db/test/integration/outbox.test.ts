import { createEvent } from '@clumera/kernel';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appendOutbox, createPrismaClient, processOutbox, type OutboxConsumer } from '../../src';
import { testDatabaseUrl } from '../../src/testing';

/** Corre contra un PostgreSQL real (TEST_DATABASE_URL con las migraciones aplicadas). */
const url = testDatabaseUrl('db');
const db = url ? createPrismaClient(url) : null;

describe.skipIf(!db)('outbox sobre PostgreSQL', () => {
  const prisma = db!;
  afterAll(() => prisma.$disconnect());
  beforeEach(async () => {
    await prisma.processedEvent.deleteMany();
    await prisma.outboxEvent.deleteMany();
  });

  it('entrega cada evento una vez por consumidor aunque se procese dos veces', async () => {
    const seen: string[] = [];
    const consumer: OutboxConsumer = { name: 'test', types: ['payment.approved'], handle: async (e) => void seen.push(e.id) };
    await prisma.$transaction((tx) => appendOutbox(tx, createEvent('payment.approved', 'finance', { x: 1 }, { id: 'ev-1' })));
    expect(await processOutbox(prisma, [consumer])).toEqual({ published: 1, failed: 0 });
    await prisma.outboxEvent.update({ where: { id: 'ev-1' }, data: { publishedAt: null } }); // simula reentrega
    await processOutbox(prisma, [consumer]);
    expect(seen).toEqual(['ev-1']);
  });

  it('si un consumidor falla, revierte su efecto y reintenta después', async () => {
    let calls = 0;
    const flaky: OutboxConsumer = {
      name: 'flaky',
      types: ['*'],
      handle: async () => {
        calls++;
        if (calls === 1) throw new Error('caído');
      },
    };
    await prisma.$transaction((tx) => appendOutbox(tx, createEvent('booking.confirmed', 'bookings', {}, { id: 'ev-2' })));
    expect(await processOutbox(prisma, [flaky])).toEqual({ published: 0, failed: 1 });
    expect((await prisma.outboxEvent.findUniqueOrThrow({ where: { id: 'ev-2' } })).lastError).toBe('caído');
    expect(await processOutbox(prisma, [flaky])).toEqual({ published: 1, failed: 0 });
  });
});
