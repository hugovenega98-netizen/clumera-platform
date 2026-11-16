import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';
export { appendOutbox, processOutbox, type OutboxConsumer, type OutboxRunResult } from './outbox';

/** Cliente de la base de ESTA instalación. Nunca apuntar a la base de otro club. */
export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('Falta DATABASE_URL');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { __clumeraPrisma?: PrismaClient };

/** Instancia única por proceso (evita agotar conexiones con recargas en desarrollo). */
export function getPrisma(): PrismaClient {
  globalForPrisma.__clumeraPrisma ??= createPrismaClient();
  return globalForPrisma.__clumeraPrisma;
}
