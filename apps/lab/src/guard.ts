import type { PrismaClient } from '@clumera/db';

/**
 * Lab nunca toca una base comercial. Antes de restaurar o abrir sesiones verifica:
 * - CLUMERA_LAB=1 en el entorno;
 * - la instalación es clumera-lab;
 * - la base conectada se llama clumera_lab… (o clumera_test_lab en pruebas) y coincide con LAB_DATABASE_NAME.
 */
export async function assertLabTarget(db: PrismaClient, env: Record<string, string | undefined> = process.env, clientId?: string): Promise<void> {
  if (env.CLUMERA_LAB !== '1') throw new Error('Lab deshabilitado: falta CLUMERA_LAB=1');
  if (clientId && clientId !== 'clumera-lab') throw new Error(`Lab solo opera sobre clumera-lab, no sobre ${clientId}`);
  const expected = env.LAB_DATABASE_NAME?.trim();
  if (!expected || !/^clumera(_test)?_lab[a-z0-9_]*$/.test(expected)) throw new Error('LAB_DATABASE_NAME debe empezar con clumera_lab');
  const rows = await db.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  const actual = rows[0]?.db;
  if (actual !== expected) throw new Error(`La base conectada (${actual}) no es la de Lab (${expected})`);
}
