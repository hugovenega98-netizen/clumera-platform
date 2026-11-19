import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { LAB_URL } from '../env';
import { expectNoHorizontalScroll, loginAs, notice, restoreLab } from './helpers';

/**
 * Identidad · administración del padrón con los perfiles de Lab: corregir datos, membresía (estado y
 * categoría), familias e importación desde Excel. Solo quien tiene identity:person.manage
 * (Superadmin); Contabilidad ve el padrón pero no lo cambia; Socio, nada.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const XLSX = readFileSync(new URL('../fixtures/padron.xlsx', import.meta.url));

async function openPerson(page: Page, q: string, name: RegExp) {
  await page.goto(`${LAB_URL}/admin/personas?q=${encodeURIComponent(q)}`);
  await page.getByRole('table', { name: 'Personas' }).getByRole('link', { name }).click();
  await expect(page.getByRole('navigation', { name: 'Ficha' })).toBeVisible();
}
const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name, exact: true }).click();

test('superadmin: corrige datos y cambia el estado y la categoría de la membresía', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await openPerson(page, 'camila', /Torres, Camila/);
  await tab(page, 'Datos');
  const form = page.getByRole('form', { name: 'Editar datos' });
  await form.getByLabel('Teléfono').fill('11 4444-1234');
  await form.getByLabel('Documento').fill('40.123.456');
  await form.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(notice(page)).toHaveText('Guardado: teléfono, documento.');
  await expect(form.getByText('Cargado: ••• 3456')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await tab(page, 'Membresía');
  const status = page.getByRole('form', { name: 'Cambiar estado de la membresía' });
  await status.getByLabel('Nuevo estado').selectOption({ label: 'Suspendida' });
  await status.getByLabel('Motivo').fill('Falta de pago');
  await status.getByRole('button', { name: 'Cambiar estado' }).click();
  await expect(page.locator('header .cx-tag', { hasText: 'Suspendida' })).toBeVisible();
  await status.getByLabel('Nuevo estado').selectOption({ label: 'Vigente' });
  await status.getByLabel('Motivo').fill('Regularizó');
  await status.getByRole('button', { name: 'Cambiar estado' }).click();
  await expect(page.locator('header .cx-tag', { hasText: 'Vigente' })).toBeVisible();
  const cat = page.getByRole('form', { name: 'Cambiar categoría' });
  await cat.getByLabel('Categoría').selectOption({ label: 'Vitalicio' });
  await cat.getByLabel('Motivo del cambio').fill('Corrección');
  await cat.getByRole('button', { name: 'Cambiar categoría' }).click();
  await expect(page.getByText(/Vitalicio · N°/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await tab(page, 'Historial');
  for (const t of ['Datos corregidos', 'Cambio de estado de la membresía', 'Cambio de categoría']) await expect(page.getByText(t).first()).toBeVisible();
  await expect(page.getByText('teléfono, documento')).toBeVisible();
  await expect(page.getByText(/40\.?123\.?456/)).toHaveCount(0);
});

test('superadmin: arma una familia; no deja personas a cargo sin responsable', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await openPerson(page, 'valentina', /Rossi, Valentina/);
  await tab(page, 'Familia');
  const create = page.getByRole('form', { name: 'Crear grupo familiar' });
  await expect(create.getByLabel('Nombre del grupo')).toHaveValue('Familia Rossi');
  await create.getByLabel('Vínculo (opcional)').fill('madre');
  await create.getByRole('button', { name: 'Crear grupo' }).click();

  const add = page.getByRole('form', { name: 'Sumar a Familia Rossi' });
  await add.getByRole('searchbox', { name: 'Buscar persona para sumar' }).fill('felipe');
  await add.getByRole('button', { name: 'Buscar' }).click();
  await add.getByRole('button', { name: 'Elegir: Felipe Luna' }).click();
  await add.getByLabel('Rol en la familia').selectOption({ label: 'A cargo' });
  await add.getByLabel('Vínculo').fill('hijo');
  await add.getByRole('button', { name: 'Sumar al grupo' }).click();
  await expect(page.getByRole('link', { name: 'Felipe Luna' })).toBeVisible();

  await page.getByRole('button', { name: 'Quitar del grupo: Valentina Rossi' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'necesita al menos un responsable' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // La responsable ve al hijo en su familia (misma cuenta, sin otro alta).
  await tab(page, 'Historial');
  await expect(page.getByText('Se sumó a un grupo familiar')).toBeVisible();
});

test('superadmin: importa el padrón desde Excel con revisión por fila', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.goto(`${LAB_URL}/admin/personas`);
  await page.getByRole('link', { name: 'Importar desde Excel' }).click();
  await page.getByLabel('Planilla (.xlsx o .csv)').setInputFiles({ name: 'padron.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: XLSX });
  await page.getByRole('button', { name: 'Revisar archivo' }).click();
  const review = page.getByRole('region', { name: 'Resultado de la revisión' });
  await expect(review.getByText('Alta: 1')).toBeVisible();
  await expect(review.getByText('Error: 4')).toBeVisible();
  const rows = review.getByRole('list', { name: 'Filas' });
  await expect(rows.getByText('Categoría «Menor» inexistente')).toBeVisible();
  await expect(rows.getByText('Documento repetido (fila 2)')).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Importar 1 persona' }).click();
  await expect(notice(page)).toContainText('Listo: 1 altas y 0 actualizaciones.');

  // El mismo archivo otra vez: Lucía ya está (por documento), no se duplica.
  await page.getByRole('button', { name: 'Revisar archivo' }).click();
  await expect(review.getByText('Sin cambios: 1')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Importar \d+/ })).toBeDisabled();
  await page.goto(`${LAB_URL}/admin/personas?q=lucia`);
  await expect(page.getByRole('table', { name: 'Personas' }).getByRole('link', { name: /Pérez, Lucía/ })).toHaveCount(1);
});

test('Contabilidad ve el padrón pero no lo cambia; Socio y sin sesión, nada', async ({ page }) => {
  const calls = (p: Page, personId: string) => [
    () => p.request.patch(`${LAB_URL}/api/identity/people/${personId}`, { headers: { origin: LAB_URL }, data: { phone: '1' } }),
    () => p.request.post(`${LAB_URL}/api/identity/families`, { headers: { origin: LAB_URL }, data: { name: 'Familia X', members: [{ personId, role: 'guardian' }] } }),
    () => p.request.post(`${LAB_URL}/api/identity/import`, { headers: { origin: LAB_URL }, multipart: { modo: 'vista', archivo: { name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from('Nombre,Apellido\nA,B\n') } } }),
  ];
  await loginAs(page, 'Superadmin');
  const found = (await (await page.request.get(`${LAB_URL}/api/identity/people?q=ramiro`)).json()) as { items: Array<{ id: string }> };
  const personId = found.items[0]!.id;

  for (const [profile, status] of [
    ['Contabilidad', 403],
    ['Socio', 403],
  ] as const) {
    await loginAs(page, profile);
    for (const call of calls(page, personId)) expect((await call()).status(), profile).toBe(status);
    expect((await page.goto(`${LAB_URL}/admin/personas/importar`))!.status(), profile).toBe(403);
  }
  await loginAs(page, 'Contabilidad');
  await page.goto(`${LAB_URL}/admin/personas/${personId}`);
  await expect(page.getByRole('navigation', { name: 'Ficha' }).getByRole('link', { name: 'Datos', exact: true })).toHaveCount(0);
  await page.goto(`${LAB_URL}/admin/personas`);
  await expect(page.getByRole('heading', { name: 'Padrón de personas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Importar desde Excel' })).toHaveCount(0);

  await page.context().clearCookies();
  for (const call of calls(page, personId)) expect((await call()).status()).toBe(401);
});
