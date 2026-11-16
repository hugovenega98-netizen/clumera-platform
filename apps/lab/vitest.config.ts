import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Los archivos comparten la base de Lab de prueba: uno por vez.
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000, fileParallelism: false },
});
