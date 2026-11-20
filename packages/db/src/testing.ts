/**
 * Bases de prueba: una por paquete (clumera_test_<nombre>) en el servidor de TEST_PG_URL, para que
 * las pruebas que corren en paralelo no se pisen. Sin TEST_PG_URL, las pruebas de integración se omiten.
 * Preparar con `npm run test:db:prepare`.
 */
export const TEST_DATABASES = ['db', 'identity', 'notifications', 'finance', 'sports', 'agenda', 'facilities', 'bookings', 'access', 'enrollment', 'schools', 'summer', 'web', 'lab', 'management'] as const;

export function testDatabaseUrl(name: (typeof TEST_DATABASES)[number], env: Record<string, string | undefined> = process.env): string | null {
  const base = env.TEST_PG_URL?.trim().replace(/\/+$/, '');
  return base ? `${base}/clumera_test_${name}` : null;
}
