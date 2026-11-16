/**
 * Entorno de los recorridos e2e: tres servidores de producción sobre bases locales de prueba.
 *   - core de Lab (apps/web, clumera-lab) en :3300
 *   - Lab (apps/lab) en :3301, que reenvía al core → es la URL que usan los tests
 *   - Management en :3400
 * La licencia del core deja `store` afuera a propósito, para probar el rechazo de un módulo sin licencia.
 */
export const PG = (process.env.TEST_PG_URL ?? 'postgresql://postgres@localhost:5432').replace(/\/+$/, '');
export const CORE_URL = 'http://localhost:3300';
export const LAB_URL = 'http://localhost:3301';
export const MGMT_URL = 'http://localhost:3400';
export const LAB_DB = 'clumera_test_lab';
export const MGMT_DB = 'clumera_test_management';
export const LICENSED = ['facilities', 'bookings', 'access', 'schools', 'summer', 'tournaments', 'events'];
export const ADMIN = { email: 'e2e@clumera.app', password: 'frase larga de prueba e2e' };
