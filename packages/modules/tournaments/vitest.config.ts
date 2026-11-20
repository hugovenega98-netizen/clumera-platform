import { defineConfig } from 'vitest/config';

// Las pruebas de integración comparten la base de prueba del paquete: un archivo por vez.
export default defineConfig({ test: { fileParallelism: false } });
