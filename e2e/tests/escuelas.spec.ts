import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { LAB_DB, LAB_URL, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

/**
 * Hito C · Escuelas con los perfiles de Lab: la socia inscribe a su hijo (cuota a Pagos), lista de
 * espera cuando no hay cupo y promoción al darse una baja, asistencia del profesor de natación,
 * administración de la coordinación y recorrido por rol.
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
const groupId = (name: string) => sql(`SELECT id FROM "Group" WHERE name = '${name}' LIMIT 1`);

test('socia: ve las inscripciones de la familia e inscribe a Tomás en hockey (cuota a Pagos)', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/escuelas`);
  await expect(page.getByRole('heading', { name: 'Actividades', level: 1 })).toBeVisible();
  const natacion = page.getByRole('region', { name: 'Inscripción Natación infantil · Tomás' });
  await expect(natacion.getByText('Confirmada')).toBeVisible();
  await expect(natacion.getByText(/Mar y Jue 18:00 · Pileta cubierta · Prof\. Juan Acosta/)).toBeVisible();
  // Filtro por persona.
  await page.getByRole('group', { name: 'Para quién' }).getByRole('link', { name: 'Yo' }).click();
  await expect(page.getByText('Todavía no hay inscripciones. Elegí una propuesta abierta.')).toBeVisible();
  await page.getByRole('group', { name: 'Para quién' }).getByRole('link', { name: 'Todos' }).click();
  await expectNoHorizontalScroll(page);

  await page.getByRole('link', { name: /Escuela de hockey/ }).click();
  await expect(page.getByRole('heading', { name: 'Escuela de hockey', level: 1 })).toBeVisible();
  const sub12 = page.getByRole('region', { name: 'Grupo Sub 12' });
  // La escuela pide edad: sin fecha de nacimiento en la ficha, la socia no puede inscribirse.
  await expect(sub12.getByText('Falta la fecha de nacimiento en la ficha')).toBeVisible();
  await expect(sub12.getByRole('button', { name: 'Inscribir a mí' })).toHaveCount(0);
  await sub12.getByRole('button', { name: 'Inscribir a Tomás' }).click();
  await expect(sub12.getByRole('status')).toHaveText('Inscripción confirmada. La cuota del mes está en Pagos.');
  await expect(sub12.getByText('Inscripto')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto(`${LAB_URL}/pagos`);
  // Pagos separa por concepto: la cuota de la escuela de Tomás va en su propio grupo.
  await expect(page.getByRole('region', { name: 'Tomás · Escuela de hockey', exact: true })).toBeVisible();
});

test('lista de espera: grupo lleno, baja de la coordinación y promoción en orden', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/escuelas/natacion`);
  const sabados = page.getByRole('region', { name: 'Grupo Sábados 10' });
  await expect(sabados.getByText('Completo · 1 en espera')).toBeVisible();
  await sabados.getByRole('button', { name: 'Anotar en espera a Tomás' }).click();
  await expect(sabados.getByRole('status')).toHaveText('Quedó en lista de espera (puesto 2). Te avisamos si se libera un lugar.');
  await page.goto(`${LAB_URL}/escuelas`);
  await expect(page.getByRole('region', { name: 'Inscripción Natación infantil · Tomás' }).filter({ hasText: 'Sábados 10' }).getByText('Espera · 2°')).toBeVisible();

  // La coordinación da de baja a Emma: Pilar (1°) toma el lugar y Tomás pasa a 1°.
  await loginAs(page, 'Coordinador');
  await page.goto(`${LAB_URL}/admin/escuelas`);
  const card = page.getByRole('region', { name: 'Propuesta Natación infantil' });
  await card.getByText('Sábados 10', { exact: true }).click();
  await card.getByRole('button', { name: 'Dar de baja: Emma Díaz · Sábados 10' }).click();
  const form = page.getByRole('form', { name: 'Baja: Emma Díaz · Sábados 10' });
  await form.getByLabel('Motivo').fill('Se mudó de barrio');
  await form.getByRole('button', { name: 'Confirmar baja' }).click();
  await expect(card.getByText('Pilar Núñez')).toBeVisible();
  await expectNoHorizontalScroll(page);
  expect(sql(`SELECT status FROM "Enrollment" WHERE "personId" = '${personId('Pilar', 'Núñez')}' AND "groupId" = '${groupId('Sábados 10')}'`)).toBe('confirmed');
  expect(sql(`SELECT "waitPosition" FROM "Enrollment" WHERE "personId" = '${personId('Tomás', 'Fernández')}' AND "groupId" = '${groupId('Sábados 10')}'`)).toBe('1');
  // La cuota de Emma (impaga) se anuló; Pilar tiene la suya.
  expect(sql(`SELECT status FROM "Charge" WHERE "personId" = '${personId('Emma', 'Díaz')}' AND description LIKE 'Natación infantil · Sábados 10%'`)).toBe('cancelled');
  expect(sql(`SELECT count(*) FROM "Charge" WHERE "personId" = '${personId('Pilar', 'Núñez')}' AND status = 'pending'`)).toBe('1');

  // La socia ve a Tomás 1° y puede salir de la espera.
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/escuelas`);
  const wait = page.getByRole('region', { name: 'Inscripción Natación infantil · Tomás' }).filter({ hasText: 'Sábados 10' });
  await expect(wait.getByText('Espera · 1°')).toBeVisible();
  await wait.getByRole('button', { name: /^Salir de la espera/ }).click();
  await page.getByRole('form', { name: /^Baja: Natación infantil/ }).getByLabel('Motivo').fill('Prefiere los martes');
  await page.getByRole('form', { name: /^Baja: Natación infantil/ }).getByRole('button', { name: 'Confirmar baja' }).click();
  await expect(page.getByRole('region', { name: 'Inscripción Natación infantil · Tomás' })).toHaveCount(1);
});

test('profesor de natación: toma asistencia de su grupo; no ve ni marca otros', async ({ page }) => {
  await loginAs(page, 'Profesor');
  await page.goto(`${LAB_URL}/escuelas/asistencia`);
  const group = page.getByRole('group', { name: 'Grupo' });
  await expect(group.getByRole('link', { name: 'Natación infantil · Mar y Jue 18' })).toBeVisible();
  await expect(group.getByRole('link', { name: /hockey/i })).toHaveCount(0);
  await group.getByRole('link', { name: 'Natación infantil · Mar y Jue 18' }).click();
  const list = page.getByRole('list', { name: 'Lista del grupo' });
  await expect(list.getByText('Tomás Fernández')).toBeVisible();
  await list.getByRole('group', { name: 'Asistencia de Emma Díaz' }).getByRole('button', { name: 'Ausente' }).click();
  await expect(list.getByRole('group', { name: 'Asistencia de Emma Díaz' }).getByRole('button', { name: 'Ausente' })).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: 'Guardar asistencia' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Asistencia guardada' })).toHaveText('Asistencia guardada: 1 presentes, 1 ausentes, 0 tarde.');
  await page.reload();
  await expect(page.getByText('La asistencia de hoy ya está guardada. Podés corregirla.')).toBeVisible();
  // Otro grupo (hockey, de otra actividad): la API lo rechaza.
  const today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  expect((await post(page, `/api/m/schools/groups/${groupId('Sub 12')}/attendance`, { day: today, marks: [{ personId: personId('Tomás', 'Fernández'), mark: 'present' }] })).status()).toBe(403);
});

test('coordinación: crea una propuesta con su grupo y emite las cuotas sin duplicar', async ({ page }) => {
  await loginAs(page, 'Coordinador');
  await page.goto(`${LAB_URL}/admin/escuelas`);
  const np = page.getByRole('form', { name: 'Nueva propuesta' });
  await np.getByLabel('Nombre').fill('Escuela de vóley');
  await np.getByLabel('Identificador').fill('escuela-voley');
  await np.getByLabel('Edad mínima').fill('10');
  await np.getByLabel('Edad máxima').fill('16');
  await np.getByLabel('Cuota socio ($ por mes)').fill('11000');
  await np.getByLabel('Cuota general ($ por mes)').fill('14000');
  await np.getByRole('button', { name: 'Crear propuesta' }).click();
  await expect(np.getByText('Propuesta creada. Ahora sumale grupos.')).toBeVisible();
  const card = page.getByRole('region', { name: 'Propuesta Escuela de vóley' });
  await card.getByText('Agregar un grupo').click();
  const ng = page.getByRole('form', { name: 'Nuevo grupo de Escuela de vóley' });
  await ng.getByLabel('Nombre del grupo').fill('Sub 14');
  await ng.getByRole('group', { name: 'Días' }).getByText('Mar').click();
  await ng.getByRole('group', { name: 'Días' }).getByText('Vie').click();
  await ng.getByLabel('Cupo').fill('16');
  await ng.getByRole('button', { name: 'Crear grupo' }).click();
  await expect(card.getByText('Mar y Vie 18:00')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('button', { name: /^Emitir cuotas de / }).click();
  await expect(page.getByText(/^(Se emitieron \d+ cuotas|Las cuotas de .+ ya estaban emitidas)/)).toBeVisible();
  const before = sql(`SELECT count(*) FROM "Charge" WHERE source = 'schools'`);
  await page.reload();
  await page.getByRole('button', { name: /^Emitir cuotas de / }).click();
  await expect(page.getByText(/ya estaban emitidas/)).toBeVisible();
  expect(sql(`SELECT count(*) FROM "Charge" WHERE source = 'schools'`)).toBe(before);
});

test('recorrido por rol de Escuelas', async ({ page }) => {
  const status = async (path: string) => (await page.goto(`${LAB_URL}${path}`))!.status();
  const program = { slug: 'x-prueba', name: 'Prueba', activity: 'x-prueba', membersOnly: false, memberFee: 100, guestFee: 100 };

  await loginAs(page, 'Superadmin');
  for (const p of ['/escuelas', '/admin/escuelas', '/escuelas/asistencia']) expect(await status(p), `Superadmin ${p}`).toBe(200);

  await loginAs(page, 'Coordinador');
  expect(await status('/admin/escuelas')).toBe(200);
  expect(await status('/escuelas/asistencia')).toBe(403);

  await loginAs(page, 'Socio');
  expect(await status('/escuelas')).toBe(200);
  expect(await status('/admin/escuelas')).toBe(403);
  expect(await status('/escuelas/asistencia')).toBe(403);
  expect((await post(page, '/api/m/schools/programs', program)).status()).toBe(403);
  // A alguien que no es de su familia, no.
  expect((await post(page, '/api/m/schools/enrollments', { groupId: groupId('Sub 12'), personId: personId('Emma', 'Díaz') })).status()).toBe(403);

  await loginAs(page, 'Profesor');
  expect(await status('/escuelas/asistencia')).toBe(200);
  expect(await status('/admin/escuelas')).toBe(403);

  for (const profile of ['Contabilidad', 'Recepción', 'Médico/Kine'] as const) {
    await loginAs(page, profile);
    expect(await status('/admin/escuelas'), `${profile} /admin/escuelas`).toBe(403);
    expect(await status('/escuelas/asistencia'), `${profile} /escuelas/asistencia`).toBe(403);
    expect((await post(page, '/api/m/schools/fees', { period: '2026-11' })).status(), `${profile} fees`).toBe(403);
  }

  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/escuelas`);
  await expect(page).toHaveURL(/\/ingresar/);
  expect((await post(page, '/api/m/schools/enrollments', { groupId: 'x', personId: 'x' })).status()).toBe(401);
});
