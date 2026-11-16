import { expect, type Page } from '@playwright/test';
import { LAB_URL } from '../env';

/** Vuelve Lab a los datos base desde su propio botón (como lo haría una persona). */
export async function restoreLab(page: Page) {
  await page.goto(`${LAB_URL}/lab`);
  await page.getByRole('button', { name: 'Restaurar datos base' }).click();
  await expect(page.getByText('Lab volvió a los datos base.')).toBeVisible();
}

export async function loginAs(page: Page, profile: string) {
  await page.goto(`${LAB_URL}/lab`);
  await page.getByRole('button', { name: profile, exact: true }).click();
  await page.waitForURL(`${LAB_URL}/`);
}

/** Sin desbordes horizontales: la pantalla entra en el ancho del dispositivo. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Avisos de la interfaz (Notice). Next agrega su propio role=alert para anunciar rutas, así que se buscan por clase. */
export const notice = (page: Page) => page.locator('.cx-notice');
