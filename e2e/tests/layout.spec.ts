import { expect, test } from '@playwright/test';
import { LAB_URL } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

/**
 * Mobile first con versión de escritorio de cada pantalla: en el teléfono, barra + dock; en
 * escritorio, menú lateral. Corre en los proyectos «escritorio» y «movil».
 */
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const isDesktop = (w: number | undefined) => (w ?? 0) >= 981;

test('inicio: menú lateral en escritorio, dock en el teléfono', async ({ page }) => {
  await loginAs(page, 'Socio');
  const desktop = isDesktop(page.viewportSize()?.width);
  const side = page.getByRole('navigation', { name: 'Secciones', exact: true });
  const dock = page.getByRole('navigation', { name: 'Navegación principal' });
  if (desktop) {
    await expect(side).toBeVisible();
    await expect(side.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await expect(side.getByRole('link', { name: 'Reservar' })).toBeVisible();
    await expect(dock).toBeHidden();
  } else {
    await expect(dock).toBeVisible();
    await expect(dock.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
    await expect(dock.getByRole('link', { name: 'Más' })).toBeVisible();
    await expect(side).toBeHidden();
  }
  await expectNoHorizontalScroll(page);
});

test('cuenta: la sección actual queda marcada en el menú que corresponde', async ({ page }) => {
  await loginAs(page, 'Coach');
  await page.goto(`${LAB_URL}/cuenta`);
  const desktop = isDesktop(page.viewportSize()?.width);
  const nav = desktop ? page.getByRole('navigation', { name: 'Cuenta' }) : page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('link', { name: desktop ? 'Mi cuenta' : 'Más' })).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalScroll(page);
});

test('ingreso: panel de marca solo en escritorio', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/ingresar`);
  const hero = page.getByRole('region', { name: 'Clumera Lab' });
  if (isDesktop(page.viewportSize()?.width)) await expect(hero).toBeVisible();
  else await expect(hero).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Ingresar', level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('Lab: perfiles en grilla en escritorio y en una columna en el teléfono', async ({ page }) => {
  await page.goto(`${LAB_URL}/lab`);
  const boxes = await page.locator('.lab-profile').evaluateAll((els) => els.slice(0, 3).map((e) => e.getBoundingClientRect().top));
  const sameRow = boxes.every((t) => Math.abs(t - boxes[0]!) < 2);
  expect(sameRow).toBe(isDesktop(page.viewportSize()?.width));
  await expect(page.getByRole('navigation', { name: 'Secciones de Lab' }).getByRole('link', { name: 'Perfiles' })).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalScroll(page);
});
