import { expect, test } from '@playwright/test';
import { LAB_URL } from '../env';

test('manifiesto instalable con la identidad del club', async ({ request }) => {
  const res = await request.get(`${LAB_URL}/manifest.webmanifest`);
  expect(res.headers()['content-type']).toContain('manifest+json');
  const m = await res.json();
  expect(m).toMatchObject({ name: 'Clumera Lab', short_name: 'Clumera Lab', display: 'standalone', start_url: '/lab?source=pwa', scope: '/' });
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

test('Lab se ofrece para instalar: manifiesto enlazado y botón «Instalar app»', async ({ page }) => {
  await page.goto(`${LAB_URL}/lab`);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  // El service worker queda registrado para todo el origen, también desde /lab.
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(`${LAB_URL}/`);
  const install = page.getByRole('button', { name: 'Instalar app' });
  await expect(install).toBeVisible();
  // Sin aviso nativo del navegador (headless), el botón muestra los pasos del menú.
  await install.click();
  await expect(page.getByRole('region', { name: 'Cómo instalar la app' })).toContainText('Instalar app');
});

test('el botón usa el aviso nativo cuando el navegador lo ofrece', async ({ page }) => {
  await page.goto(`${LAB_URL}/ingresar`);
  const install = page.getByRole('button', { name: 'Instalar app' });
  await expect(install).toBeVisible();
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
    e.prompt = async () => void ((window as unknown as { __prompted: boolean }).__prompted = true);
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await install.click();
  expect(await page.evaluate(() => (window as unknown as { __prompted?: boolean }).__prompted)).toBe(true);
  await expect(install).toBeHidden();
});

test.describe('iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  test('muestra los pasos de Safari para agregar a inicio', async ({ page }) => {
    await page.goto(`${LAB_URL}/lab`);
    await page.getByRole('button', { name: 'Instalar app' }).click();
    await expect(page.getByRole('region', { name: 'Cómo instalar la app' })).toContainText('Agregar a inicio');
  });
});

test('abierta desde el ícono (modo app) no muestra el botón', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ matches: true, media: q } as MediaQueryList) : original(q));
  });
  await page.goto(`${LAB_URL}/lab`);
  await expect(page.getByRole('heading', { name: 'Clumera Lab', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instalar app' })).toHaveCount(0);
});
