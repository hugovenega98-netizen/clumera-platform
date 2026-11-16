import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

export function createManagementDb(connectionString = process.env.MANAGEMENT_DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('Falta MANAGEMENT_DATABASE_URL');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const g = globalThis as unknown as { __clumeraMgmtDb?: PrismaClient };
export function getManagementDb(): PrismaClient {
  g.__clumeraMgmtDb ??= createManagementDb();
  return g.__clumeraMgmtDb;
}
