import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { LAB_DB, LAB_URL, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

/**
 * Hito B · Accesos con Recepción, con los perfiles de Lab: carnet vigente, caso B (una credencial
 * revocada no entra), excepción con motivo, búsqueda por persona, códigos ajenos y el registro de
 * intentos. Recepción ve validez, motivo y nombre; nunca deuda ni salud. Cada ruta, por rol.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const sql = (q: string) => execFileSync('psql', [`${PG}/${LAB_DB}`, '-Atc', q]).toString().trim();
const post = (page: Page, path: string, data: unknown) => page.request.post(`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });
const personId = (first: string, last: string) => sql(`SELECT id FROM "Person" WHERE "firstName" = '${first}' AND "lastName" = '${last}' LIMIT 1`);
/** QR vigente del carnet, como lo ve quien puede abrirlo (Superadmin). */
async function cardToken(page: Page, id: string) {
  const body = (await (await page.request.get(`${LAB_URL}/api/identity/card?persona=${id}`)).json()) as { qr: { token: string } | null };
  return body.qr!.token;
}

test('Recepción: carnet vigente, caso B (revocado no entra), excepción con motivo y registro', async ({ page }) => {
  const lucas = personId('Lucas', 'Benítez');
  await loginAs(page, 'Superadmin');
  const oldToken = await cardToken(page, lucas);
  // Se revoca el carnet (p. ej. lo perdió): el QR viejo deja de entrar al instante.
  const credential = sql(`SELECT id FROM "Credential" WHERE "personId" = '${lucas}' AND kind = 'member_card' AND status = 'active' LIMIT 1`);
  expect((await post(page, `/api/identity/credentials/${credential}/revoke`, { reason: 'Carnet extraviado' })).status()).toBe(200);
  const newToken = await cardToken(page, lucas);
  expect(newToken).not.toBe(oldToken);

  await loginAs(page, 'Recepción');
  // Recepción no entra al inicio institucional (403): su inicio es el puesto de acceso.
  await page.goto(`${LAB_URL}/recepcion`);
  await expect(page.getByRole('heading', { name: 'Acceso principal' })).toBeVisible();
  // El «Inicio» del menú (lateral en escritorio, dock en el teléfono) lleva al puesto.
  await expect(page.getByRole('link', { name: 'Inicio', exact: true }).first()).toHaveAttribute('href', '/recepcion');
  await expectNoHorizontalScroll(page);
  const code = page.getByRole('textbox', { name: 'Código del QR' });
  const result = page.getByRole('region', { name: 'Resultado' });

  await code.fill(oldToken);
  await page.getByRole('button', { name: 'Validar', exact: true }).click();
  await expect(result.getByText('✕ INGRESO DENEGADO')).toBeVisible();
  await expect(result.getByText('Lucas Benítez')).toBeVisible();
  await expect(result.getByText('Credencial revocada.')).toBeVisible();
  await expect(result.getByText('No se muestran deudas ni datos de salud.')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Excepción autorizada: pide motivo y queda registrada.
  await result.getByRole('button', { name: 'Excepción autorizada' }).click();
  const why = page.getByRole('form', { name: 'Excepción autorizada' });
  await expect(why.getByRole('button', { name: 'Autorizar ingreso' })).toBeDisabled();
  await why.getByLabel('Motivo de la excepción').fill('Lo autoriza Secretaría: carnet nuevo en trámite');
  await why.getByRole('button', { name: 'Autorizar ingreso' }).click();
  await expect(result.getByText('✓ INGRESO PERMITIDO')).toBeVisible();
  await expect(result.getByText('Excepción autorizada · Lo autoriza Secretaría: carnet nuevo en trámite')).toBeVisible();
  const log = page.getByRole('region', { name: 'Últimos intentos' });
  await expect(log.getByText('Lucas Benítez · Excepción autorizada · Lo autoriza Secretaría: carnet nuevo en trámite')).toBeVisible();
  await expect(log.getByText('Lucas Benítez · Credencial revocada.')).toBeVisible();
  expect(sql(`SELECT count(*) FROM "AuditLog" WHERE action = 'access.override' AND "entityId" = '${lucas}'`)).toBe('1');

  // El carnet nuevo sí entra.
  await result.getByRole('button', { name: 'Siguiente' }).click();
  await code.fill(newToken);
  await page.getByRole('button', { name: 'Validar', exact: true }).click();
  await expect(result.getByText('✓ INGRESO PERMITIDO')).toBeVisible();
  await expect(result.getByText(/^Socio N° \d+ · /)).toBeVisible();

  // Búsqueda por persona: la membresía suspendida no habilita.
  await page.getByRole('searchbox', { name: 'Buscar persona' }).fill('Méndez');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: 'Validar a Julieta Méndez' }).click();
  await expect(result.getByText('✕ INGRESO DENEGADO')).toBeVisible();
  await expect(result.getByText('Sin membresía vigente.')).toBeVisible();

  // Un código ajeno se registra, sin nombre ni excepción posible.
  await code.fill('hola-esto-no-es-un-carnet');
  await page.getByRole('button', { name: 'Validar', exact: true }).click();
  await expect(result.getByText('El código no es de este club.')).toBeVisible();
  await expect(result.getByRole('button', { name: 'Excepción autorizada' })).toHaveCount(0);
  await expect(page.getByText('Rechazos hoy')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Otro punto de acceso: su propio registro.
  await page.getByRole('group', { name: 'Punto de acceso' }).getByRole('link', { name: 'Pileta' }).click();
  await expect(page.getByRole('heading', { name: 'Pileta' })).toBeVisible();
  await expect(page.getByText('Todavía no hubo intentos en este punto.')).toBeVisible();
});

test('lo que recibe Recepción: validez, motivo y nombre; nunca deuda, salud ni ids internos', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  const token = await cardToken(page, personId('Martina', 'Gómez'));
  await loginAs(page, 'Recepción');
  const point = sql(`SELECT id FROM "AccessPoint" WHERE slug = 'principal'`);
  const res = await post(page, '/api/m/access/check', { pointId: point, token });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ granted: true, person: { firstName: 'Martina', lastName: 'Gómez' } });
  expect(JSON.stringify(body)).not.toMatch(/personId|credentialId|deuda|saldo|salud|balance|health|email|phone|document/i);
  const people = await (await page.request.get(`${LAB_URL}/api/m/access/people?q=G%C3%B3mez`)).json();
  expect(Object.keys(people.items[0]).sort()).toEqual(['id', 'memberNumber', 'name']);
});

test('recorrido por rol: solo Recepción y Superadmin validan', async ({ page }) => {
  const point = sql(`SELECT id FROM "AccessPoint" WHERE slug = 'principal'`);
  const attempt = sql(`SELECT id FROM "AccessAttempt" WHERE result = 'denied' AND "personId" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`);
  const status = async (path: string) => (await page.goto(`${LAB_URL}${path}`))!.status();

  await loginAs(page, 'Superadmin');
  expect(await status('/recepcion')).toBe(200);
  await expect(page.getByRole('region', { name: 'Últimos intentos' })).toBeVisible();

  for (const profile of ['Socio', 'Coach', 'Contabilidad', 'Encargado de instalaciones', 'Médico/Kine', 'Caja'] as const) {
    await loginAs(page, profile);
    expect(await status('/recepcion'), `${profile} /recepcion`).toBe(403);
    expect((await post(page, '/api/m/access/check', { pointId: point, token: 'x' })).status(), `${profile} check`).toBe(403);
    expect((await post(page, `/api/m/access/attempts/${attempt}/override`, { reason: 'Prueba de permisos' })).status(), `${profile} override`).toBe(403);
    expect((await page.request.get(`${LAB_URL}/api/m/access/people?q=Gomez`)).status(), `${profile} people`).toBe(403);
  }

  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/recepcion`);
  await expect(page).toHaveURL(/\/ingresar/);
  expect((await post(page, '/api/m/access/check', { pointId: point, token: 'x' })).status()).toBe(401);
});
