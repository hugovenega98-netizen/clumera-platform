import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { LAB_DB, LAB_URL, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, notice, restoreLab } from './helpers';

/**
 * Hito A · Deportes con los perfiles de Lab: Mis deportes (una cuenta, dos deportes y un hijo),
 * coach (plantel, partido, convocatoria, publicación), Mesa de control con reloj e incidencias,
 * minuto a minuto público y administración de equipos con aranceles por equipo.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const post = (page: Page, path: string, data: unknown) => page.request.post(`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });
let playedId = '';

test('socia: dos deportes y su hijo en una sola cuenta; responde la convocatoria de Tomás', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/deportes`);
  await expect(page.getByRole('region', { name: 'Hockey · Damas' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vóley · Mixto' })).toBeVisible();
  const tomas = page.getByRole('region', { name: 'Rugby · M12 · Tomás' });
  await expect(tomas.getByText('Club Norte')).toBeVisible();
  await tomas.getByRole('button', { name: 'Voy' }).click();
  await expect(tomas.getByRole('button', { name: 'Voy' })).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalScroll(page);

  // Cargos separados por concepto: cuota, cada deporte y lo del hijo.
  await page.goto(`${LAB_URL}/pagos`);
  for (const name of ['Membresía social', 'Hockey · Damas', 'Vóley · Mixto', 'Tomás · Rugby · M12', 'Tomás · Membresía social']) await expect(page.getByRole('region', { name, exact: true })).toBeVisible();
});

test('socia: avisa una ausencia de Tomás y ve su rendimiento', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/deportes`);
  await page.getByRole('region', { name: 'Rugby · M12 · Tomás' }).getByRole('link', { name: /Partidos, disponibilidad/ }).click();
  await expect(page.getByText('Mirando como responsable de Tomás.')).toBeVisible();
  await page.getByRole('navigation', { name: 'Secciones del equipo' }).getByRole('link', { name: 'Disponibilidad' }).click();
  const form = page.getByRole('form', { name: 'Avisar ausencia' });
  await form.getByLabel('Fecha').fill('2030-03-14');
  await form.getByLabel('Motivo').fill('Viaje familiar');
  await form.getByRole('button', { name: 'Avisar ausencia' }).click();
  await expect(page.getByText('Viaje familiar')).toBeVisible();
  await page.getByRole('navigation', { name: 'Secciones del equipo' }).getByRole('link', { name: 'Rendimiento' }).click();
  await expect(page.getByRole('region', { name: 'Resumen' }).getByText('Partidos')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('coach: plantel de M19, programa un partido, arma la formación y publica el minuto a minuto', async ({ page }) => {
  await loginAs(page, 'Coach');
  await page.goto(`${LAB_URL}/deportes`);
  await page.getByRole('link', { name: 'Rugby · M19' }).click();
  await expect(page.getByText('Ferrari, Bruno')).toBeVisible();
  const form = page.getByRole('form', { name: 'Nuevo partido' });
  await form.getByLabel('Rival').fill('Universitario');
  await form.getByLabel('Fecha y hora').fill('2030-04-06T11:00');
  await form.getByLabel('Lugar').fill('Cancha 2');
  await form.getByRole('button', { name: 'Programar y convocar' }).click();
  await expect(page.getByRole('heading', { name: /Universitario/, level: 1 })).toBeVisible();
  await expect(page.getByText(/Convocatoria · 0 de 4 respondieron/)).toBeVisible();
  await page.getByRole('checkbox', { name: 'En la formación: Ferrari, Bruno' }).check();
  await page.getByRole('button', { name: 'Guardar formación' }).click();
  await expect(notice(page)).toContainText('Formación guardada: 1 jugador');
  await page.getByRole('button', { name: 'Publicar minuto a minuto' }).click();
  await expect(page.getByRole('button', { name: 'Minuto a minuto: público' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('coach: solo sus equipos; sin mesa ni administración', async ({ page }) => {
  await loginAs(page, 'Coach');
  const m12 = await page.request.get(`${LAB_URL}/api/sports/matches`, { failOnStatusCode: false });
  expect(m12.status()).toBe(405); // solo POST
  // Un partido del plantel superior (no lo dirige): sin acceso.
  await page.goto(`${LAB_URL}/deportes`);
  expect((await page.goto(`${LAB_URL}/deportes/mesa`))!.status()).toBe(403);
  expect((await page.goto(`${LAB_URL}/admin/deportes`))!.status()).toBe(403);
  expect((await post(page, '/api/sports/teams', { sportId: 'x', name: 'X', slug: 'x-x' })).status()).toBe(403);
});

test('mesa de control: reloj, incidencias, deshacer y final del partido de hoy', async ({ page }) => {
  await loginAs(page, 'Mesa');
  await page.goto(`${LAB_URL}/deportes`);
  await page.getByRole('link', { name: 'Ir a la mesa' }).click();
  await page.getByRole('link', { name: /Plantel superior vs\. San Martín/ }).click();
  const board = page.getByRole('region', { name: 'Marcador' });
  await page.getByRole('button', { name: 'Iniciar partido' }).click();
  await expect(board.getByText('● En juego')).toBeVisible();
  const events = page.getByRole('region', { name: 'Cargar incidencia' });
  await expect(events.getByRole('button', { name: 'Try +5', exact: true })).toBeDisabled();
  await page.getByRole('region', { name: 'Reloj' }).getByRole('button', { name: 'Iniciar' }).click();
  await expect(events.getByRole('button', { name: 'Try +5', exact: true })).toBeEnabled();

  await events.getByLabel('Jugador').selectOption({ label: 'Martín Sosa' });
  await events.getByRole('button', { name: 'Try +5', exact: true }).click();
  await expect(board.getByLabel(/Plantel superior 5, San Martín 0/)).toBeVisible();
  await events.getByRole('radio', { name: 'San Martín' }).click();
  await events.getByRole('button', { name: 'Penal a los palos +3', exact: true }).click();
  await expect(board.getByLabel(/Plantel superior 5, San Martín 3/)).toBeVisible();
  await events.getByRole('button', { name: 'Deshacer última' }).click();
  await expect(board.getByLabel(/Plantel superior 5, San Martín 0/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Incidencias cargadas' }).getByText('Martín Sosa')).toBeVisible();

  const clock = page.getByRole('region', { name: 'Reloj' });
  await clock.getByRole('button', { name: 'Entretiempo' }).click();
  await clock.getByRole('button', { name: 'Iniciar 2.º tiempo' }).click();
  await clock.getByRole('button', { name: 'Terminar reloj' }).click();
  await events.getByRole('button', { name: 'Final del partido' }).click();
  await expect(notice(page)).toContainText('El coach confirma el resultado oficial');
  await expectNoHorizontalScroll(page);
});

test('mesa: no opera deportes fuera de su ámbito (hockey) ni sin sesión', async ({ page }) => {
  await loginAs(page, 'Mesa');
  const hockeyMatch = await findMatch(page, 'Lomas');
  expect((await post(page, `/api/sports/matches/${hockeyMatch}/start`, {})).status()).toBe(403);
  expect((await post(page, `/api/sports/matches/${hockeyMatch}/events`, { type: 'goal', side: 'own' })).status()).toBe(403);
  await page.context().clearCookies();
  expect((await post(page, `/api/sports/matches/${hockeyMatch}/events`, { type: 'goal', side: 'own' })).status()).toBe(401);
});

/** Id de un partido por rival (lectura directa de la base de prueba de Lab). */
async function findMatch(_page: Page, opponent: string): Promise<string> {
  const sql = `SELECT id FROM "Match" WHERE opponent = '${opponent.replace(/'/g, "''")}' ORDER BY "startsAt" LIMIT 1`;
  return execFileSync('psql', [`${PG}/${LAB_DB}`, '-Atc', sql]).toString().trim();
}

test('minuto a minuto: privado pide sesión; publicado lo ve cualquiera', async ({ page, browser }) => {
  playedId = await findMatch(page, 'Atlético Sur');
  const anon = await browser.newPage();
  expect((await anon.request.get(`${LAB_URL}/api/sports/matches/${playedId}/live`)).status()).toBe(401);
  await anon.goto(`${LAB_URL}/vivo/${playedId}`);
  await expect(anon).toHaveURL(/\/ingresar\?next=/);

  await loginAs(page, 'Coach');
  expect((await post(page, `/api/sports/matches/${playedId}/public`, { mamPublic: true })).status()).toBe(200);
  await anon.goto(`${LAB_URL}/vivo/${playedId}`);
  await expect(anon.getByRole('region', { name: 'Marcador' }).getByLabel('M19 24, Atlético Sur 15')).toBeVisible();
  const timeline = anon.getByRole('list', { name: 'Minuto a minuto' });
  await expect(timeline.getByText('Bruno Ferrari').first()).toBeVisible();
  await expect(timeline.getByRole('listitem')).toHaveCount(11);
  await expectNoHorizontalScroll(anon);
  await anon.close();
});

test('administración: equipo nuevo con arancel, plantel y aranceles del mes a Finanzas', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.goto(`${LAB_URL}/admin/deportes`);
  const team = page.getByRole('form', { name: 'Nuevo equipo' });
  await team.getByLabel('Deporte').selectOption({ label: 'Rugby' });
  await team.getByLabel('Equipo o categoría').fill('M15');
  await expect(team.getByLabel('Identificador')).toHaveValue('rugby-m15');
  await team.getByLabel('Arancel mensual').fill('16.000');
  await team.getByRole('button', { name: 'Crear equipo' }).click();
  await page.getByRole('link', { name: 'M15', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Buscar persona' }).fill('santino');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('button', { name: 'Sumar al plantel: Santino Paz' }).click();
  await expect(page.getByRole('button', { name: 'Quitar del plantel: Santino Paz' })).toBeVisible();

  await page.goto(`${LAB_URL}/admin/deportes`);
  const fees = page.getByRole('form', { name: 'Emitir aranceles' });
  await fees.getByRole('button', { name: 'Emitir aranceles' }).click();
  await expect(fees.locator('.cx-notice')).toContainText(/Emitidos 1 aranceles \(\d+ ya estaban\)/);
  await expectNoHorizontalScroll(page);
});

test('sin acceso a la mesa ni a la administración de deportes: Recepción y Socio', async ({ page }) => {
  for (const profile of ['Recepción', 'Socio'] as const) {
    await loginAs(page, profile);
    expect((await page.goto(`${LAB_URL}/deportes/mesa`))!.status(), profile).toBe(403);
    expect((await page.goto(`${LAB_URL}/admin/deportes`))!.status(), profile).toBe(403);
  }
});
