import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Las pruebas de rutas importan cada handler en frío (el grafo de módulos es grande): más margen.
  test: { include: ['test/**/*.test.ts'], testTimeout: 30_000 },
});
