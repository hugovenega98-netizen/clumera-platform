import { expect, test } from '@playwright/test';
import { LAB_URL } from '../env';

test('manifiesto instalable con la identidad del club', async ({ request }) => {
  const res = await request.get(`${LAB_URL}/manifest.webmanifest`);
  expect(res.headers()['content-type']).toContain('manifest+json');
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Clumera Lab', short_name: 'Clumera Lab', display: 'standalone', start_url: '/?source=pwa' });
  const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of m.icons) expect((await request.get(`${LAB_URL}${icon.src}`)).status()).toBe(200);
});

test('el service worker se registra y sirve la página sin conexión', async ({ page, context }) => {
  await page.goto(`${LAB_URL}/ingresar`);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(`${LAB_URL}/`);
  // Esperar a que el SW controle la página y precachee la página sin conexión.
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const offlineCached = () =>
    page.evaluate(async () => {
      for (const name of await caches.keys()) if (name.includes('precache') && (await (await caches.open(name)).keys()).some((r) => r.url.includes('/offline.html'))) return true;
      return false;
    });
  await expect.poll(offlineCached, { timeout: 15_000 }).toBe(true);

  // Abrir la app sin conexión en una pestaña nueva (el SW controla todo el origen).
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto(`${LAB_URL}/una-pagina-que-nunca-se-visito`);
  await expect(offline.getByRole('heading', { name: 'Estás sin conexión' })).toBeVisible();
  await expect(offline).toHaveURL(`${LAB_URL}/una-pagina-que-nunca-se-visito`);
  await context.setOffline(false);
});
