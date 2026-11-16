import { expect, test } from '@playwright/test';
import { LAB_URL } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

test.describe.configure({ mode: 'serial' });

test('el selector de perfiles abre una sesión real del core', async ({ page }) => {
  await restoreLab(page);
  await expectNoHorizontalScroll(page);
  await loginAs(page, 'Coach');
  await expect(page.getByRole('heading', { name: 'Hola, Martín' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: 'Martín' }).click();
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
  await expect(page.getByText('coach@lab.clumera.app')).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(/\/ingresar/);
  await page.goto(`${LAB_URL}/`);
  await expect(page).toHaveURL(/\/ingresar\?next=%2F/);
});

test('la navegación muestra solo lo licenciado y visible', async ({ page }) => {
  await loginAs(page, 'Socio');
  const nav = page.getByRole('navigation', { name: 'Secciones' });
  await expect(nav.getByRole('link', { name: 'Reservar' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Carnet' })).toBeVisible();
  // Tienda está visible en la config de Lab pero sin licencia en e2e.
  await expect(nav.getByRole('link', { name: 'Tienda' })).toHaveCount(0);
});

test('restaurar cierra las sesiones de la demo', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await expect(page.getByRole('heading', { name: 'Hola, Sofía' })).toBeVisible();
  await restoreLab(page);
  await page.goto(`${LAB_URL}/cuenta`);
  await expect(page).toHaveURL(/\/ingresar/);
});
