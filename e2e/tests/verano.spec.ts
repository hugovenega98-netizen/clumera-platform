import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { LAB_DB, LAB_URL, MOCK_MP, MP_WEBHOOK_SECRET, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, restoreLab } from './helpers';

/**
 * Hito C · Colonia de verano — caso C del plan: una familia inscribe a dos hijos en colonia con
 * documentos y retiro autorizado. Pago por Mercado Pago (simulado), revisión de la coordinación
 * (el apto físico es dato de salud: ni Superadmin lo abre) y recorrido por rol.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const sql = (q: string) => execFileSync('psql', [`${PG}/${LAB_DB}`, '-Atc', q]).toString().trim();
const post = (page: Page, path: string, data: unknown) => page.request.post(`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });
const PDF = Buffer.from('%PDF-1.4\n% documento de prueba e2e\n');
const enrollmentOf = (first: string) => sql(`SELECT e.id FROM "Enrollment" e JOIN "Person" p ON p.id = e."personId" JOIN "Group" g ON g.id = e."groupId" JOIN "Program" pr ON pr.id = g."programId" WHERE p."firstName" = '${first}' AND pr.module = 'summer' AND e.status <> 'withdrawn' LIMIT 1`);

async function approveLastCheckout(page: Page, paymentId: string, amount: number) {
  const pref = (await (await page.request.get(`${MOCK_MP}/__last-preference`)).json()) as { external_reference: string };
  await page.request.post(`${MOCK_MP}/__payments`, { data: { id: paymentId, status: 'approved', transaction_amount: amount, external_reference: pref.external_reference } });
  const ts = String(Date.now());
  const v1 = createHmac('sha256', MP_WEBHOOK_SECRET).update(`id:${paymentId};request-id:r-${ts};ts:${ts};`).digest('hex');
  const hook = await page.request.post(`${LAB_URL}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, { headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': `r-${ts}` }, data: { type: 'payment', data: { id: paymentId } } });
  expect(await hook.json()).toMatchObject({ status: 'approved' });
}

test('caso C: la socia inscribe a sus dos hijos con documentos, retiro autorizado y pago', async ({ page }, info) => {
  const base = info.project.name === 'movil' ? 772000 : 771000;
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/verano`);
  const camp = page.getByRole('region', { name: 'Colonia de verano' });
  await expect(camp.getByText(/10% de descuento desde el segundo hermano/)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Tomás (12, socio) en Líderes: tarifa socio.
  await camp.getByRole('button', { name: 'Inscribir a Tomás' }).nth(3).click();
  await expect(page.getByRole('heading', { name: 'Documentación' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Inscripción de Tomás' }).getByText('$ 80.000', { exact: true })).toBeVisible();
  const tomasId = new URL(page.url()).pathname.split('/').pop()!;

  // Lola (8, no socia) en Aventureros: tarifa general con 10% por hermana.
  await page.goto(`${LAB_URL}/verano`);
  await expect(camp.getByText(/G3 · Aventureros.*\$ 90\.000 \(con 10% familiar\)/)).toBeVisible();
  await camp.getByRole('button', { name: 'Inscribir a Lola' }).nth(2).click();
  await expect(page.getByRole('heading', { name: 'Documentación' })).toBeVisible();
  const lola = page.getByRole('region', { name: 'Inscripción de Lola' });
  await expect(lola.getByText('Inscripción · descuento familiar')).toBeVisible();
  await expect(lola.getByText('$ 90.000', { exact: true })).toBeVisible();
  await expect(lola.getByRole('status')).toHaveText(/Faltan 3 documentos aprobados · falta el pago/);

  // Documentos: un archivo que no es PDF ni foto se rechaza; los tres PDF se suben.
  const docs = page.getByRole('region', { name: 'Documentos requeridos' });
  await docs.getByLabel('Subir Apto físico').setInputFiles({ name: 'apto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>x</script></html>') });
  await expect(docs.getByText('Subí un PDF o una foto (JPG, PNG o WEBP)')).toBeVisible();
  for (const label of ['Apto físico', 'Copia de DNI', 'Autorización de salidas']) {
    await docs.getByLabel(`Subir ${label}`).setInputFiles({ name: `${label}.pdf`, mimeType: 'application/pdf', buffer: PDF });
    await expect(docs.getByRole('listitem', { name: `${label}: En revisión` })).toBeVisible();
  }
  await expectNoHorizontalScroll(page);

  // Retiro autorizado: el papá, con DNI (se guarda protegido: últimos 4).
  const pick = page.getByRole('region', { name: 'Pueden retirarlo' });
  await expect(pick.getByText('Titular')).toBeVisible();
  await pick.getByRole('button', { name: '+ Agregar persona autorizada' }).click();
  const pf = page.getByRole('form', { name: 'Persona autorizada a retirar' });
  await pf.getByLabel('Nombre', { exact: true }).fill('Pablo');
  await pf.getByLabel('Apellido').fill('Fernández');
  await pf.getByLabel('Vínculo').fill('padre');
  await pf.getByLabel('DNI').fill('30.123.456');
  await pf.getByRole('button', { name: 'Autorizar' }).click();
  await expect(pick.getByText('padre · DNI terminado en 3456')).toBeVisible();

  // Emergencias y uso de imagen.
  const em = page.getByRole('form', { name: 'Salud y emergencias' });
  await em.getByLabel('Contacto de emergencia').fill('Abuela Rosa');
  await em.getByLabel('Teléfono de emergencia').fill('11 4444 0000');
  await em.getByLabel('Autorizo el uso de imagen en las redes del club').check();
  await em.getByRole('button', { name: 'Guardar' }).click();
  await expect(em.getByRole('status')).toHaveText('Datos guardados.');

  // Pago de Lola por Mercado Pago (simulado).
  await lola.getByRole('button', { name: 'Pagar $ 90.000' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout simulado' })).toBeVisible();
  await approveLastCheckout(page, String(base + 1), 90000);
  await page.goto(`${LAB_URL}/verano/inscripcion/${enrollmentOf('Lola')}`);
  await expect(lola.getByRole('status')).toHaveText(/Faltan 3 documentos aprobados · pago acreditado/);

  // Tomás: los mismos documentos (por la API), el mismo papá autorizado (no se duplica) y su pago.
  for (const code of ['apto', 'dni', 'salidas']) {
    const res = await page.request.post(`${LAB_URL}/api/m/summer/enrollments/${tomasId}/documents/${code}`, { headers: { origin: LAB_URL }, multipart: { file: { name: `${code}.pdf`, mimeType: 'application/pdf', buffer: PDF } } });
    expect(res.status(), code).toBe(201);
  }
  const tomas = sql(`SELECT id FROM "Person" WHERE "firstName" = 'Tomás' AND "lastName" = 'Fernández'`);
  expect((await post(page, '/api/identity/pickups', { minorId: tomas, firstName: 'Pablo', lastName: 'Fernández', relation: 'padre', document: '30123456' })).status()).toBe(201);
  expect(sql(`SELECT count(*) FROM "Person" WHERE "firstName" = 'Pablo' AND "lastName" = 'Fernández'`)).toBe('1');
  expect(sql(`SELECT count(*) FROM "Person" WHERE "docLast4" = '3456' AND "docDigest" IS NOT NULL`)).toBe('1');
  await page.goto(`${LAB_URL}/verano/inscripcion/${tomasId}`);
  await page.getByRole('region', { name: 'Inscripción de Tomás' }).getByRole('button', { name: 'Pagar $ 80.000' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout simulado' })).toBeVisible();
  await approveLastCheckout(page, String(base + 2), 80000);

  // El apto físico es dato de salud: la familia lo descarga; Superadmin y Recepción, no.
  const apto = sql(`SELECT ed."fileId" FROM "EnrollmentDocument" ed JOIN "ProgramDocument" pd ON pd.id = ed."documentId" WHERE ed."enrollmentId" = '${enrollmentOf('Lola')}' AND pd.code = 'apto'`);
  const own = await page.request.get(`${LAB_URL}/api/files/${apto}`);
  expect(own.status()).toBe(200);
  expect(own.headers()['content-disposition']).toMatch(/^attachment/);
  expect(own.headers()['x-content-type-options']).toBe('nosniff');
  for (const profile of ['Superadmin', 'Recepción', 'Coach'] as const) {
    await loginAs(page, profile);
    expect((await page.request.get(`${LAB_URL}/api/files/${apto}`)).status(), `${profile} apto`).toBe(404);
  }
});

test('coordinación: revisa (rechaza y aprueba) y las dos inscripciones quedan confirmadas', async ({ page }) => {
  await loginAs(page, 'Superadmin');
  await page.goto(`${LAB_URL}/admin/verano`);
  const lolaS = page.getByRole('region', { name: 'Colonia de Lola Fernández' });
  await expect(lolaS.getByText('Lo revisa la coordinación con permiso de salud.')).toBeVisible();
  await expect(lolaS.getByRole('button', { name: 'Aprobar Apto físico de Lola' })).toHaveCount(0);
  const aptoItem = sql(`SELECT ed.id FROM "EnrollmentDocument" ed JOIN "ProgramDocument" pd ON pd.id = ed."documentId" WHERE ed."enrollmentId" = '${enrollmentOf('Lola')}' AND pd.code = 'apto'`);
  expect((await post(page, `/api/m/summer/documents/${aptoItem}/review`, { approve: true })).status()).toBe(403);

  await loginAs(page, 'Coordinador');
  await page.goto(`${LAB_URL}/admin/verano`);
  await expect(page.getByText('Documentación incompleta')).toBeVisible();
  const lola = page.getByRole('region', { name: 'Colonia de Lola Fernández' });
  await expect(lola.getByText(/Retiran: .*Pablo Fernández \(padre · DNI …3456\)/)).toBeVisible();
  await lola.getByRole('button', { name: 'Aprobar Apto físico de Lola' }).click();
  await lola.getByRole('button', { name: 'Aprobar Copia de DNI de Lola' }).click();
  await lola.getByRole('button', { name: 'Rechazar Autorización de salidas de Lola' }).click();
  const rej = page.getByRole('form', { name: 'Rechazar Autorización de salidas de Lola' });
  await rej.getByLabel('Motivo del rechazo').fill('Falta la firma del responsable');
  await rej.getByRole('button', { name: 'Rechazar' }).click();
  await expect(lola.getByText(/Rechazado · Falta la firma del responsable/)).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Tomás: todo aprobado y pago acreditado → confirmada.
  const tomasCard = page.getByRole('region', { name: 'Colonia de Tomás Fernández' });
  for (const label of ['Apto físico', 'Copia de DNI', 'Autorización de salidas']) await tomasCard.getByRole('button', { name: `Aprobar ${label} de Tomás` }).click();
  await expect(tomasCard.getByText('Confirmada')).toBeVisible();

  // La familia ve el rechazo, sube la autorización firmada y la coordinación la aprueba.
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/verano/inscripcion/${enrollmentOf('Lola')}`);
  const docs = page.getByRole('region', { name: 'Documentos requeridos' });
  await expect(docs.getByText(/Rechazado · .*Falta la firma del responsable/)).toBeVisible();
  await docs.getByLabel('Reemplazar Autorización de salidas').setInputFiles({ name: 'salidas-firmada.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(docs.getByRole('listitem', { name: 'Autorización de salidas: En revisión' })).toBeVisible();
  await loginAs(page, 'Coordinador');
  await page.goto(`${LAB_URL}/admin/verano`);
  await page.getByRole('region', { name: 'Colonia de Lola Fernández' }).getByRole('button', { name: 'Aprobar Autorización de salidas de Lola' }).click();
  await expect(page.getByRole('region', { name: 'Colonia de Lola Fernández' }).getByText('Confirmada')).toBeVisible();

  // La socia: las dos confirmadas y el aviso.
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/verano`);
  await expect(page.getByRole('link', { name: 'Colonia de Tomás: Confirmada' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Colonia de Lola: Confirmada' })).toBeVisible();
  await page.goto(`${LAB_URL}/avisos`);
  await expect(page.getByText('Colonia confirmada: Lola')).toBeVisible();
});

test('recorrido por rol de la colonia', async ({ page }) => {
  const status = async (path: string) => (await page.goto(`${LAB_URL}${path}`))!.status();
  const sofia = enrollmentOf('Sofía');

  await loginAs(page, 'Coordinador');
  expect(await status('/admin/verano')).toBe(200);

  await loginAs(page, 'Socio');
  expect(await status('/verano')).toBe(200);
  expect(await status('/admin/verano')).toBe(403);
  // La inscripción de otra familia: ni se ve ni se le suben documentos.
  expect(await status(`/verano/inscripcion/${sofia}`)).toBe(404);
  const up = await page.request.post(`${LAB_URL}/api/m/summer/enrollments/${sofia}/documents/salidas`, { headers: { origin: LAB_URL }, multipart: { file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: PDF } } });
  expect(up.status()).toBe(403);
  const sofiaPerson = sql(`SELECT id FROM "Person" WHERE "firstName" = 'Sofía' AND "lastName" = 'Gómez'`);
  expect((await post(page, '/api/identity/pickups', { minorId: sofiaPerson, firstName: 'Xx', lastName: 'Yy', relation: 'vecina', document: '20111222' })).status()).toBe(403);

  for (const profile of ['Profesor', 'Recepción', 'Contabilidad', 'Encargado de instalaciones'] as const) {
    await loginAs(page, profile);
    expect(await status('/admin/verano'), `${profile} /admin/verano`).toBe(403);
  }

  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/verano`);
  await expect(page).toHaveURL(/\/ingresar/);
  expect((await post(page, '/api/m/summer/enrollments', { groupId: 'x', personId: 'x' })).status()).toBe(401);
});
