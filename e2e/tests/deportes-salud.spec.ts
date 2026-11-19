import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { LAB_DB, LAB_URL, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, notice, restoreLab } from './helpers';

/**
 * Hito A · Deportes B con los perfiles de Lab: salud (Médico/Kine evalúa; el coach solo ve la
 * disponibilidad; Superadmin no entra), pases de invitado, transmisión, seguir partido con aviso
 * por incidencia y planilla transitoria.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const post = (page: Page, path: string, data: unknown) => page.request.post(`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });
const sql = (q: string) => execFileSync('psql', [`${PG}/${LAB_DB}`, '-Atc', q]).toString().trim();
const reportId = (zone: string) => sql(`SELECT id FROM "InjuryReport" WHERE zone = '${zone}' LIMIT 1`);
const matchOf = (team: string, opponent: string) => sql(`SELECT m.id FROM "Match" m JOIN "Team" t ON t.id = m."teamId" WHERE t.slug = '${team}' AND m.opponent = '${opponent}' LIMIT 1`);

test('Médico/Kine: consultorio de rugby, evalúa y deja historial con nota privada', async ({ page }) => {
  await loginAs(page, 'Médico/Kine');
  await page.goto(`${LAB_URL}/deportes/salud`);
  await expect(page.getByText('Consultorio · 2 seguimientos abiertos')).toBeVisible();
  const list = page.getByRole('list', { name: 'Seguimientos' });
  await expect(list.getByRole('link', { name: 'Gonzalo Núñez' })).toBeVisible();
  await list.getByRole('link', { name: 'Iván Rojas' }).click();
  await expect(page.getByRole('heading', { name: 'Iván Rojas', level: 1 })).toBeVisible();
  await expect(page.getByText('Tobillo derecho')).toBeVisible();
  const form = page.getByRole('form', { name: 'Nueva evaluación' });
  await form.getByLabel('Estado').selectOption({ label: 'En seguimiento' });
  await form.getByLabel('Disponibilidad deportiva').selectOption({ label: 'No disponible' });
  await form.getByLabel('Indicaciones para la persona y su familia').fill('Reposo deportivo por cinco días.');
  await form.getByLabel('Nota clínica privada (solo Médico/Kine)').fill('Ficticio: esguince leve.');
  await form.getByRole('button', { name: 'Guardar evaluación' }).click();
  await expect(notice(page)).toContainText('Evaluación guardada');
  await expect(page.getByText('Nota privada: Ficticio: esguince leve.')).toBeVisible();
  await expect(page.getByText('Historial · 1')).toBeVisible();
  await expect(page.getByText('Rugby · M19 · En seguimiento · No disponible')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('coach: solo la disponibilidad en el plantel; sin acceso clínico', async ({ page }) => {
  await loginAs(page, 'Coach');
  await page.goto(`${LAB_URL}/deportes`);
  await page.getByRole('link', { name: 'Rugby · M19' }).click();
  const row = page.locator('.rows > div', { hasText: 'Rojas, Iván' });
  await expect(row.getByText('No disponible (salud)')).toBeVisible();
  await expect(page.getByText(/Tobillo|esguince|Reposo/i)).toHaveCount(0);
  const id = reportId('Tobillo derecho');
  expect((await page.goto(`${LAB_URL}/deportes/salud/${id}`))!.status()).toBe(403);
  expect((await post(page, `/api/sports/injuries/${id}/evaluations`, { status: 'closed', availability: 'no_restrictions' })).status()).toBe(403);
  await page.goto(`${LAB_URL}/deportes/salud`);
  await expect(page.getByText(/Consultorio/)).toHaveCount(0);
});

test('Superadmin: el comodín no alcanza los datos clínicos', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  const id = reportId('Hombro izquierdo');
  expect((await page.goto(`${LAB_URL}/deportes/salud/${id}`))!.status()).toBe(403);
  expect((await post(page, `/api/sports/injuries/${id}/evaluations`, { status: 'closed', availability: 'no_restrictions' })).status()).toBe(403);
  await page.goto(`${LAB_URL}/deportes/salud`);
  await expect(page.getByText(/Consultorio/)).toHaveCount(0);
});

test('socia: informa una lesión de Tomás y ve el estado, sin notas clínicas', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/deportes/salud`);
  const form = page.getByRole('form', { name: 'Informar lesión' });
  await form.getByLabel('Quién y en qué equipo').selectOption({ label: 'Tomás · Rugby M12' });
  await form.getByLabel('Zona').fill('Rodilla izquierda');
  await form.getByRole('button', { name: 'Enviar a Médico/Kine' }).click();
  await expect(notice(page)).toContainText('Reporte enviado a Médico/Kine');
  const card = page.getByRole('region', { name: 'Reporte Rodilla izquierda' });
  await expect(card.getByText('Pendiente de evaluación')).toBeVisible();
  await expect(card.getByText(/Tomás · Rugby · M12/)).toBeVisible();
  // Informar por alguien que no es de su familia: 403.
  const other = sql(`SELECT id FROM "Person" WHERE "firstName" = 'Iván' AND "lastName" = 'Rojas' LIMIT 1`);
  const m19 = sql(`SELECT id FROM "Team" WHERE slug = 'rugby-m19'`);
  expect((await post(page, '/api/sports/injuries', { personId: other, teamId: m19, zone: 'X X', pain: 1, context: 'Partido', impact: 'Nada', onsetDate: '2026-01-01' })).status()).toBe(403);
  await expectNoHorizontalScroll(page);
});

test('pase de invitado y transmisión: el coach genera un código; el invitado ve el partido hasta que se revoca', async ({ page, browser }) => {
  const id = matchOf('rugby-m19', 'Club Norte');
  await loginAs(page, 'Coach');
  await page.goto(`${LAB_URL}/deportes/partidos/${id}`);
  await page.getByLabel('Transmisión de YouTube').fill('https://youtu.be/dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Guardar transmisión' }).click();
  await expect(page.getByText('Transmisión guardada.')).toBeVisible();
  await page.getByRole('button', { name: 'Generar código' }).click();
  const code = (await page.getByTestId('guest-code').textContent())!.trim();
  expect(code).toMatch(/^INV-[A-Z0-9]{16}$/);

  const anon = await browser.newPage();
  expect((await anon.request.get(`${LAB_URL}/api/sports/matches/${id}/live`)).status()).toBe(401);
  await anon.goto(`${LAB_URL}/vivo/${id}`);
  const form = anon.getByRole('form', { name: 'Código de invitado' });
  await form.getByLabel('Código de invitado').fill('INV-AAAAAAAAAAAAAAAA');
  await form.getByRole('button', { name: 'Ver el partido' }).click();
  await expect(form.getByText('no es válido')).toBeVisible();
  await form.getByLabel('Código de invitado').fill(code.toLowerCase());
  await form.getByRole('button', { name: 'Ver el partido' }).click();
  await expect(anon.getByRole('region', { name: 'Marcador' })).toBeVisible();
  await expect(anon.locator('iframe[title^="Transmisión"]')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  await expect(anon.getByText('Estás como invitado.')).toBeVisible();
  expect((await anon.request.get(`${LAB_URL}/api/sports/matches/${id}/live`)).status()).toBe(200);
  await expectNoHorizontalScroll(anon);

  await page.getByRole('button', { name: 'Revocar pases' }).click();
  await expect(page.getByText('Pases revocados')).toBeVisible();
  expect((await anon.request.get(`${LAB_URL}/api/sports/matches/${id}/live`)).status()).toBe(401);
  await anon.close();
});

test('seguir partido: aviso por cada incidencia; planilla transitoria en la mesa', async ({ page, browser }) => {
  const id = matchOf('rugby-primera', 'San Martín');
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/vivo/${id}`);
  await page.getByRole('button', { name: 'Seguir partido' }).click();
  await expect(page.getByRole('button', { name: 'Siguiendo · avisos activos' })).toHaveAttribute('aria-pressed', 'true');

  const desk = await browser.newPage();
  await loginAs(desk, 'Mesa');
  const temp = await post(desk, `/api/sports/matches/${id}/temporary-players`, { name: 'Invitado Pérez', number: 23 });
  expect(temp.status()).toBe(201);
  const { id: tempId } = (await temp.json()) as { id: string };
  expect((await post(desk, `/api/sports/matches/${id}/start`, {})).status()).toBe(200);
  expect((await post(desk, `/api/sports/matches/${id}/clock`, { action: 'start_first_half' })).status()).toBe(200);
  expect((await post(desk, `/api/sports/matches/${id}/events`, { type: 'try', side: 'own', temporaryPlayerId: tempId })).status()).toBe(200);
  const live = (await (await desk.request.get(`${LAB_URL}/api/sports/matches/${id}/live`)).json()) as { events: Array<{ player: string }> };
  expect(live.events[0]!.player).toBe('Invitado Pérez (23)');
  await desk.close();

  await expect
    .poll(
      async () => {
        await page.goto(`${LAB_URL}/avisos`);
        return page.getByText('Try de Plantel superior (Invitado Pérez (23))').count();
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByText(/Plantel superior 5–0 San Martín/).first()).toBeVisible();
});
