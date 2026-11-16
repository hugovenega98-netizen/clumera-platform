import { expect, test, type Page } from '@playwright/test';
import { LAB_URL } from '../env';
import { loginAs, notice, restoreLab } from './helpers';

/**
 * Permisos probados con la capa de usuarios de Lab: los mismos perfiles del selector, contra
 * rutas reales del servidor. Autorizados y denegados.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const createAccount = (page: Page) =>
  page.request.post(`${LAB_URL}/api/identity/accounts`, { headers: { origin: LAB_URL }, data: {} });

test('crear cuentas: sin sesión 401', async ({ page }) => {
  expect((await createAccount(page)).status()).toBe(401);
});

for (const [profile, status] of [
  ['Superadmin', 400], // autorizado: llega a validar los datos (vacíos)
  ['Coach', 403],
  ['Recepción', 403],
  ['Contabilidad', 403],
  ['Socio', 403],
] as const) {
  test(`crear cuentas como ${profile}: ${status}`, async ({ page }) => {
    await loginAs(page, profile);
    expect((await createAccount(page)).status()).toBe(status);
  });
}

test('la matriz de permisos de Lab coincide con lo esperado', async ({ page }) => {
  await page.goto(`${LAB_URL}/lab/permisos`);
  await expect(page.getByRole('heading', { name: 'Permisos por perfil' })).toBeVisible();
  await expect(notice(page)).toHaveText('Todo coincide con lo esperado.');
  // Tienda está sin licencia en e2e: ni Superadmin ni Caja pueden vender.
  const sell = page.locator('tr[data-case="sell"]');
  await expect(sell.getByLabel('superadmin: no puede')).toBeVisible();
  await expect(sell.getByLabel('caja: no puede')).toBeVisible();
  const health = page.locator('tr[data-case="health"]');
  await expect(health.getByLabel('medico: puede')).toBeVisible();
  await expect(health.getByLabel('coach: no puede')).toBeVisible();
});

test('la tabla de permisos no ensancha la página', async ({ page }) => {
  await page.goto(`${LAB_URL}/lab/permisos`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
