import { expect, test } from '@playwright/test';
import { ADMIN, MGMT_URL } from '../env';
import { notice } from './helpers';

test.describe.configure({ mode: 'serial' });

test('acceso solo con credenciales de administrador', async ({ page }) => {
  await page.goto(`${MGMT_URL}/`);
  await expect(page).toHaveURL(`${MGMT_URL}/login`);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill('equivocada');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(notice(page)).toHaveText('Email o contraseña incorrectos.');
});

test('alta de instalación con licencia, config y variables', async ({ page }) => {
  await page.goto(`${MGMT_URL}/login`);
  await page.getByLabel('Email').fill(ADMIN.email);
  await page.getByLabel('Contraseña').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Instalaciones' })).toBeVisible();

  await page.getByRole('link', { name: 'Nueva instalación' }).click();
  await page.getByLabel('Identificador del club').fill('club-e2e');
  await page.getByLabel('Nombre completo').fill('Club Atlético E2E');
  await page.getByLabel('Nombre visible').fill('Atlético E2E');
  await page.getByLabel('Subdominio').fill('e2e');
  await page.getByRole('checkbox', { name: /Reservas/ }).check();
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(notice(page)).toContainText('Reservas necesita Instalaciones');

  // Lo cargado sigue ahí después del error.
  await expect(page.getByLabel('Identificador del club')).toHaveValue('club-e2e');
  await expect(page.getByRole('checkbox', { name: /Reservas/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /^Instalaciones$/ }).check();
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(page.getByText('Instalación dada de alta.')).toBeVisible();
  await expect(page.getByText('bookings, facilities · 1 deportes')).toBeVisible();
  const envBlock = page.locator('pre', { hasText: 'CLUMERA_LICENSE=ey' });
  await expect(envBlock).toContainText('CLUMERA_CLIENT_ID=club-e2e');
  await expect(envBlock).toContainText('CLUMERA_LICENSE_PUBLIC_KEY=');
  await expect(page.getByText(/"clientId": "club-e2e"/)).toBeVisible();
  await expect(page.getByText(/MANAGEMENT_LICENSE_PRIVATE_KEY/)).toHaveCount(0);

  await page.getByRole('checkbox', { name: /Tienda/ }).check();
  await page.getByRole('button', { name: 'Emitir licencia nueva' }).click();
  await expect(page.getByText('Licencia nueva emitida.')).toBeVisible();
  await expect(page.getByText('bookings, facilities, store · 1 deportes')).toBeVisible();
});

test('la configuración inicial no funciona con la contraseña ya cargada', async ({ page }) => {
  await page.goto(`${MGMT_URL}/configurar`);
  await expect(notice(page)).toContainText('ya está configurada');
});
