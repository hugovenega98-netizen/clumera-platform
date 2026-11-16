import { expect, test, type Page } from '@playwright/test';
import { LAB_URL } from '../env';
import { notice, restoreLab } from './helpers';

test.describe.configure({ mode: 'serial' });

const LOGIN = 'pendiente@lab.clumera.app';
const PASSWORD = 'la cancha de los sábados';
const NEW_PASSWORD = 'otra frase para el club';

async function openLatestMailLink(page: Page, subject: RegExp) {
  await page.goto(`${LAB_URL}/lab/correo`);
  const card = page.locator('section', { has: page.getByRole('heading', { name: subject }) }).first();
  await card.getByRole('link').first().click();
}

test('activación por enlace de un solo uso', async ({ page }) => {
  await restoreLab(page);
  // La cuenta pendiente no puede ingresar todavía.
  await page.goto(`${LAB_URL}/ingresar`);
  await page.getByLabel('Email o usuario').fill(LOGIN);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(notice(page)).toHaveText('Usuario o contraseña incorrectos.');

  await openLatestMailLink(page, /Activá tu cuenta/);
  await expect(page.getByRole('heading', { name: 'Activá tu cuenta' })).toBeVisible();
  const activationUrl = page.url();

  await page.getByLabel('Contraseña nueva').fill('corta');
  await page.getByLabel('Repetila').fill('corta');
  await page.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(notice(page)).toContainText('al menos 10 caracteres');

  await page.getByLabel('Contraseña nueva').fill(PASSWORD);
  await page.getByLabel('Repetila').fill(PASSWORD);
  await page.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Pedro' })).toBeVisible();

  // El mismo enlace ya no sirve.
  await page.context().clearCookies();
  await page.goto(activationUrl);
  await page.getByLabel('Contraseña nueva').fill(PASSWORD);
  await page.getByLabel('Repetila').fill(PASSWORD);
  await page.getByRole('button', { name: 'Activar cuenta' }).click();
  await expect(notice(page)).toContainText('no es válido o ya venció');
});

test('ingreso con contraseña y vuelta a la página pedida', async ({ page }) => {
  await page.goto(`${LAB_URL}/avisos`);
  await expect(page).toHaveURL(/\/ingresar\?next=%2Favisos/);
  await page.getByLabel('Email o usuario').fill('PENDIENTE@lab.clumera.app');
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible();
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name.endsWith('clumera_session'));
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
});

test('recuperación de contraseña sin revelar cuentas', async ({ page }) => {
  await page.goto(`${LAB_URL}/recuperar`);
  await page.getByLabel('Email o usuario').fill('nadie@lab.clumera.app');
  await page.getByRole('button', { name: 'Mandarme el enlace' }).click();
  await expect(notice(page)).toHaveText('Si el usuario existe, te mandamos un enlace por correo.');

  await page.getByLabel('Email o usuario').fill(LOGIN);
  await page.getByRole('button', { name: 'Mandarme el enlace' }).click();
  await expect(notice(page)).toHaveText('Si el usuario existe, te mandamos un enlace por correo.');

  await openLatestMailLink(page, /Recuperá tu contraseña/);
  await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
  await page.getByLabel('Repetila').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Pedro' })).toBeVisible();
});

test('bloqueo tras intentos fallidos', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/ingresar`);
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Email o usuario').fill(LOGIN);
    await page.getByLabel('Contraseña').fill('equivocada siempre');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(notice(page)).toHaveText('Usuario o contraseña incorrectos.');
  }
  await page.getByLabel('Contraseña').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(notice(page)).toContainText('bloqueamos el ingreso');
});
