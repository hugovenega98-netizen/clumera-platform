import { defineConfig } from 'prisma/config';

// `generate` y `validate` no se conectan: alcanza con una URL de forma válida.
// Migraciones y seeds siempre contra la base (o rama de Neon) de ESTA instalación.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder' },
});
