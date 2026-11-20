import { defineConfig } from 'vitest/config';

// Las pruebas de integración comparten la base de prueba del paquete: un archivo por vez.
// El login hashea varias contraseñas (scrypt): con las demás suites en paralelo supera los 5 s.
export default defineConfig({ test: { fileParallelism: false, testTimeout: 30_000 } });
