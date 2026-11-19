import { defineConfig } from 'prisma/config';

// `generate` y `validate` no se conectan: alcanza con una URL de forma válida.
// Migraciones y seeds siempre contra la base (o rama de Neon) de ESTA instalación.
// `migrate deploy` toma un bloqueo de sesión (pg_advisory_lock): por el pooler de Neon (pgbouncer en
// modo transacción) ese bloqueo puede quedar colgado y trabar el siguiente deploy. Por eso la CLI usa
// la conexión directa (DATABASE_URL_UNPOOLED) cuando existe; la app sigue usando DATABASE_URL.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || 'postgresql://placeholder:placeholder@localhost:5432/placeholder' },
});
