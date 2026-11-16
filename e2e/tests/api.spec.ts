import { expect, test } from '@playwright/test';
import { CORE_URL, LAB_URL } from '../env';

test('la API rechaza un módulo sin licencia, en el proxy y salteándolo', async ({ request }) => {
  const off = await request.get(`${LAB_URL}/api/m/store/status`);
  expect(off.status()).toBe(403);
  expect((await off.json()).error.code).toBe('module_not_licensed');
  // Directo contra el core, sin pasar por Lab.
  expect((await request.get(`${CORE_URL}/api/m/store/status`)).status()).toBe(403);
  expect((await request.get(`${LAB_URL}/api/m/bookings/status`)).status()).toBe(200);
});

test('las páginas de un módulo apagado no se muestran', async ({ page }) => {
  const res = await page.goto(`${LAB_URL}/tienda`);
  expect(res?.status()).toBe(403);
  await expect(page.getByRole('heading', { name: 'Esta sección no está disponible' })).toBeVisible();
});

test('escrituras de otro origen se rechazan', async ({ request }) => {
  const r = await request.post(`${LAB_URL}/api/auth/login`, { headers: { origin: 'https://malicioso.example' }, data: { login: 'a', password: 'b' } });
  expect(r.status()).toBe(403);
});

test('el cron exige su secreto', async ({ request }) => {
  expect((await request.get(`${CORE_URL}/api/cron/outbox`)).status()).toBe(401);
  const ok = await request.get(`${CORE_URL}/api/cron/outbox`, { headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
  expect(ok.status()).toBe(200);
});

test('salud de la instalación sin datos personales', async ({ request }) => {
  const body = await (await request.get(`${CORE_URL}/api/health`)).json();
  expect(body.clientId).toBe('clumera-lab');
  expect(body.license.licenseId).toBe('lic_e2e');
  expect(body.modules).not.toContain('store');
});
