import { expect, test, type Page } from '@playwright/test';
import { LAB_URL } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

/**
 * Hito A · Identidad con los perfiles de Lab: carnet con QR rotativo, familia, espacios y la
 * validación en la entrada (Recepción ve validez y motivo, nunca deuda ni salud).
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const card = (page: Page, persona?: string) => page.request.get(`${LAB_URL}/api/identity/card${persona ? `?persona=${persona}` : ''}`);
const validate = (page: Page, token: string) =>
  page.request.post(`${LAB_URL}/api/m/access/validate`, { headers: { origin: LAB_URL }, data: { token } });

let tomasId = '';
let anaToken = '';

test('socia: ve su carnet con QR y el de su hijo', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/carnet`);
  const credential = page.getByRole('region', { name: 'Credencial social' });
  await expect(credential.getByRole('heading', { name: 'Ana Fernández' })).toBeVisible();
  const qr = credential.getByRole('img', { name: 'Código QR de acceso' });
  await expect(qr.locator('svg')).toBeVisible();
  anaToken = (await qr.getAttribute('data-token'))!;
  expect(anaToken).toMatch(/^C1\./);
  expect(anaToken).not.toMatch(/Ana|Fern/);

  const tabs = page.getByRole('navigation', { name: 'Carnets del grupo familiar' });
  await tabs.getByRole('link', { name: 'Tomás' }).click();
  await expect(credential.getByRole('heading', { name: 'Tomás Fernández' })).toBeVisible();
  tomasId = new URL(page.url()).searchParams.get('persona')!;
  expect((await card(page, tomasId)).status()).toBe(200);
  await expectNoHorizontalScroll(page);
});

test('socia: su familia, con quién administra', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/familia`);
  await expect(page.getByRole('heading', { name: 'Familia Fernández' })).toBeVisible();
  await expect(page.getByText('Hijo · A cargo · la administrás vos')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

for (const [profile, status] of [
  ['Coach', 403],
  ['Recepción', 403],
  ['Contabilidad', 403],
  ['Superadmin', 200],
] as const) {
  test(`carnet de un menor ajeno como ${profile}: ${status}`, async ({ page }) => {
    await loginAs(page, profile);
    expect((await card(page, tomasId)).status()).toBe(status);
  });
}

test('carnet sin sesión: 401', async ({ page }) => {
  expect((await card(page)).status()).toBe(401);
});

test('Recepción valida el QR: nombre y categoría, sin deuda ni salud', async ({ page }) => {
  await loginAs(page, 'Recepción');
  const res = await validate(page, anaToken);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ valid: true, person: { firstName: 'Ana' } });
  expect(JSON.stringify(body)).not.toMatch(/deuda|saldo|salud|balance|health/i);
  expect(await (await validate(page, `${anaToken.slice(0, -1)}${anaToken.endsWith('A') ? 'B' : 'A'}`)).json()).toMatchObject({ valid: false, reason: 'firma' });
});

for (const profile of ['Socio', 'Coach', 'Contabilidad'] as const) {
  test(`validar accesos como ${profile}: 403`, async ({ page }) => {
    await loginAs(page, profile);
    expect((await validate(page, anaToken)).status()).toBe(403);
  });
}

test('espacios: una cuenta, un espacio por participación', async ({ page }) => {
  await loginAs(page, 'Coach');
  await page.goto(`${LAB_URL}/espacios`);
  const spaces = page.getByRole('radiogroup', { name: 'Espacios' });
  await expect(spaces.getByRole('radio')).toHaveCount(2);
  await expect(spaces.getByRole('radio', { name: /Mi club/ })).toHaveAttribute('aria-checked', 'true');
  await spaces.getByRole('radio', { name: /Coach/ }).click();
  // Cada espacio abre en su inicio: el del coach es Mis deportes.
  await expect(page).toHaveURL(`${LAB_URL}/deportes`);
  await page.goto(`${LAB_URL}/espacios`);
  await expect(spaces.getByRole('radio', { name: /Coach/ })).toHaveAttribute('aria-checked', 'true');
  const bad = await page.request.post(`${LAB_URL}/api/auth/context`, { headers: { origin: LAB_URL }, data: { key: 'superadmin:club:' } });
  expect(bad.status()).toBe(403);
  await expectNoHorizontalScroll(page);
});
