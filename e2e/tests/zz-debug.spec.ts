import { test } from '@playwright/test';
import { LAB_URL } from '../env';

test('debug sw', async ({ page, context }) => {
  page.on('framenavigated', (f) => f === page.mainFrame() && console.log('nav:', f.url()));
  await page.goto(`${LAB_URL}/ingresar`);
  await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  await page.reload();
  await page.waitForTimeout(1500);
  console.log(await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const r of await c.keys()) if (/offline|ingresar|localhost:3301\/(\?|$)/.test(r.url)) {
        const res = await c.match(r);
        out.push(`${k} ${r.url} ${res?.status} ${res?.redirected} ${(await res!.clone().text()).slice(0, 80).replace(/\n/g, ' ')}`);
      }
    }
    return out.join('\n');
  }));
  await context.setOffline(true);
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'document') console.log('doc resp:', r.url(), r.status(), r.fromServiceWorker(), (await r.text().catch(() => '')).slice(0, 120).replace(/\n/g, ' '));
  });
  page.on('request', (r) => r.resourceType() === 'document' && console.log('doc req:', r.url(), r.isNavigationRequest(), r.redirectedFrom()?.url()));
  await page.goto(`${LAB_URL}/otra-pagina`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
});
