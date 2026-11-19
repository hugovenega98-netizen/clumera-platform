import { expect, test, type Page } from '@playwright/test';
import { LAB_URL } from '../env';
import { expectNoHorizontalScroll, loginAs, notice, restoreLab } from './helpers';

/**
 * Hito A · Identidad (administración) con los perfiles de Lab: inicio institucional, padrón, ficha,
 * roles con alcance y alta. Quien puede y quien queda afuera (403 en pantallas y API).
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const api = (page: Page) => ({
  search: (q = '') => page.request.get(`${LAB_URL}/api/identity/people?q=${encodeURIComponent(q)}`),
  create: (data: Record<string, unknown>) => page.request.post(`${LAB_URL}/api/identity/people`, { headers: { origin: LAB_URL }, data }),
  assign: (personId: string, data: Record<string, unknown>) => page.request.post(`${LAB_URL}/api/identity/people/${personId}/roles`, { headers: { origin: LAB_URL }, data }),
});

async function openPerson(page: Page, q: string, name: RegExp) {
  await page.goto(`${LAB_URL}/admin/personas?q=${encodeURIComponent(q)}`);
  await page.getByRole('table', { name: 'Personas' }).getByRole('link', { name }).click();
  await expect(page.getByRole('navigation', { name: 'Ficha' })).toBeVisible();
}

test('superadmin: inicio institucional con el padrón del mes', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.getByRole('link', { name: 'Ir al inicio institucional' }).click();
  await expect(page.getByRole('heading', { name: 'Inicio institucional', level: 1 })).toBeVisible();
  const kpis = page.getByRole('region', { name: /Padrón/ });
  await expect(kpis.getByText('Socios activos')).toBeVisible();
  await expect(kpis.getByText('+2 altas')).toBeVisible();
  await expect(page.getByRole('img', { name: /Activo: \d+ socios activos/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('superadmin: busca sin importar acentos y filtra menores', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.goto(`${LAB_URL}/admin/personas`);
  await page.getByRole('searchbox', { name: 'Buscar en el padrón' }).fill('gomez');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const table = page.getByRole('table', { name: 'Personas' });
  await expect(table.getByRole('link')).toHaveText(['Gómez, Joaquín', 'Gómez, Martina', 'Gómez, Sofía']);
  await page.getByRole('navigation', { name: 'Filtrar el padrón' }).getByRole('link', { name: /Menores/ }).click();
  await expect(table.getByRole('link')).toHaveText(['Gómez, Joaquín', 'Gómez, Sofía']);
  await expectNoHorizontalScroll(page);
});

test('superadmin: ficha con familia, asigna y quita un rol con alcance', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await openPerson(page, 'martina', /Gómez, Martina/);
  await expect(page.getByRole('heading', { name: 'Martina Gómez', level: 1 })).toBeVisible();
  await expect(page.getByText(/información clínica/)).toBeVisible();
  await page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name: 'Familia' }).click();
  await expect(page.getByRole('link', { name: 'Sofía Gómez' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name: 'Roles' }).click();
  const form = page.getByRole('form', { name: 'Asignar un rol' });
  await form.getByLabel('Rol').selectOption({ label: 'Coach' });
  await form.getByLabel('Alcance').selectOption('team');
  await form.getByLabel('¿Cuál?').fill('rugby-m12');
  await form.getByRole('button', { name: 'Asignar rol' }).click();
  await expect(notice(page)).toHaveText('Rol asignado.');
  await expect(page.getByText('Equipo · rugby-m12 · desde')).toBeVisible();
  // Repetido: conflicto, sin duplicar.
  await form.getByRole('button', { name: 'Asignar rol' }).click();
  await expect(notice(page)).toContainText('ya tiene ese rol');
  await page.getByRole('button', { name: 'Quitar Coach (Equipo · rugby-m12)' }).click();
  await expect(page.getByText('No tiene roles asignados.')).toBeVisible();

  await page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name: 'Historial' }).click();
  await expect(page.getByText('Rol quitado')).toBeVisible();
  await expect(page.getByText('Rol asignado')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('superadmin: alta con documento, sin duplicar la persona', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.goto(`${LAB_URL}/admin/personas/nueva`);
  const form = page.getByRole('form', { name: 'Alta de persona' });
  await form.getByLabel('Nombre').fill('Lía');
  await form.getByLabel('Apellido').fill('Paz');
  await form.getByLabel('Documento').fill('40.111.222');
  await form.getByLabel('Membresía social').selectOption({ label: 'Cadete' });
  await form.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(page.getByRole('heading', { name: 'Lía Paz', level: 1 })).toBeVisible();
  await expect(page.getByText('DNI ••• 1222')).toBeVisible();
  await expect(page.getByText('40111222')).toHaveCount(0);

  await page.goto(`${LAB_URL}/admin/personas/nueva`);
  await form.getByLabel('Nombre').fill('Otra');
  await form.getByLabel('Apellido').fill('Persona');
  await form.getByLabel('Documento').fill('40111222');
  await form.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(notice(page)).toContainText('Ya hay una persona con ese documento');
  await notice(page).getByRole('link', { name: 'Ver la ficha existente' }).click();
  await expect(page.getByRole('heading', { name: 'Lía Paz', level: 1 })).toBeVisible();
  // Buscar por documento encuentra a la persona sin guardar el número.
  expect((await (await api(page).search('40111222')).json()).items).toMatchObject([{ firstName: 'Lía' }]);
});

test('superadmin: revoca un carnet y el QR deja de servir', async ({ page, browser }) => {
  // La socia abre su carnet (se emite) y guarda el código actual.
  const socio = await browser.newPage();
  await loginAs(socio, 'Socio');
  await socio.goto(`${LAB_URL}/carnet`);
  const token = (await socio.getByRole('img', { name: 'Código QR de acceso' }).getAttribute('data-token'))!;
  await socio.close();

  await loginAs(page, 'Superadmin');
  await openPerson(page, 'ana fernandez', /Fernández, Ana/);
  await page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name: 'Cuenta y carnet' }).click();
  await page.getByRole('button', { name: 'Revocar carnet' }).click();
  await page.getByLabel('Motivo').fill('Pérdida del teléfono');
  await page.getByRole('button', { name: 'Confirmar revocación' }).click();
  await expect(page.getByText('revocado: Pérdida del teléfono')).toBeVisible();

  const reception = await browser.newPage();
  await loginAs(reception, 'Recepción');
  const r = await reception.request.post(`${LAB_URL}/api/m/access/validate`, { headers: { origin: LAB_URL }, data: { token } });
  expect(await r.json()).toMatchObject({ valid: false, reason: 'revocada' });
  await reception.close();
});

test('contabilidad: ve el padrón y las fichas, pero no da altas ni roles', async ({ page }) => {
  await loginAs(page, 'Contabilidad');
  await page.goto(`${LAB_URL}/admin/personas`);
  await expect(page.getByRole('heading', { name: 'Padrón de personas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Alta de persona' })).toHaveCount(0);
  await openPerson(page, 'martina', /Gómez, Martina/);
  await page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name: 'Roles' }).click();
  await expect(page.getByRole('form', { name: 'Asignar un rol' })).toHaveCount(0);
  const martina = new URL(page.url()).pathname.split('/').pop()!;
  expect((await api(page).assign(martina, { roleCode: 'coach', scopeType: 'club' })).status()).toBe(403);
  expect((await api(page).create({ firstName: 'X', lastName: 'Y' })).status()).toBe(403);
  expect((await page.goto(`${LAB_URL}/admin/personas/nueva`))!.status()).toBe(403);
});

for (const profile of ['Coach', 'Recepción', 'Socio'] as const) {
  test(`${profile}: sin acceso a la administración (403)`, async ({ page }) => {
    await loginAs(page, profile);
    for (const path of ['/admin', '/admin/personas']) {
      const res = await page.goto(`${LAB_URL}${path}`);
      expect(res!.status(), path).toBe(403);
      await expect(page.getByRole('heading', { name: 'No tenés acceso a esta sección' })).toBeVisible();
    }
    expect((await api(page).search()).status()).toBe(403);
    await page.goto(`${LAB_URL}/`);
    await expect(page.getByRole('link', { name: 'Ir al inicio institucional' })).toHaveCount(0);
  });
}

test('Caja: su administración es Finanzas; el padrón, no (403)', async ({ page }) => {
  await loginAs(page, 'Caja');
  await page.goto(`${LAB_URL}/admin`);
  await expect(page).toHaveURL(`${LAB_URL}/admin/finanzas`);
  expect((await page.goto(`${LAB_URL}/admin/personas`))!.status()).toBe(403);
  expect((await api(page).search()).status()).toBe(403);
});

test('padrón sin sesión: la API responde 401 y la pantalla pide ingresar', async ({ page }) => {
  expect((await api(page).search()).status()).toBe(401);
  await page.goto(`${LAB_URL}/admin/personas`);
  await expect(page).toHaveURL(/\/ingresar\?next=/);
});

test('el cambio a Administración abre el inicio institucional', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.goto(`${LAB_URL}/espacios`);
  await page.getByRole('radiogroup', { name: 'Espacios' }).getByRole('radio', { name: /Administración/ }).click();
  await expect(page).toHaveURL(`${LAB_URL}/admin`);
  await expect(page.getByRole('heading', { name: 'Inicio institucional', level: 1 })).toBeVisible();
  // El «Inicio» del dock (teléfono) y del menú lateral (escritorio) vuelve al inicio institucional.
  await expect(page.locator('.cx-dock a').first()).toHaveAttribute('href', '/admin');
  await expect(page.locator('.cx-shell__side .cx-side-nav a').first()).toHaveAttribute('href', '/admin');
});
