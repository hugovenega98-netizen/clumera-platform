import { defineConfig } from 'prisma/config';

// Base propia de Management (instalaciones y licencias). Nunca la base de un club.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MANAGEMENT_DATABASE_URL ?? 'postgresql://placeholder:placeholder@localhost:5432/placeholder' },
});
