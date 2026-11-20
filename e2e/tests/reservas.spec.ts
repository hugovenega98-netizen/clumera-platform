import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { LAB_DB, LAB_URL, MOCK_MP, MP_WEBHOOK_SECRET, PG } from '../env';
import { expectNoHorizontalScroll, loginAs, notice, restoreLab } from './helpers';

/**
 * Hito B · Reservas e Instalaciones con los perfiles de Lab: turnero del socio con seña y pago
 * (Mercado Pago simulado), pagar en el club y cancelar, agenda central del encargado con bloqueos y
 * estado físico, reglas y tarifas, reservas del día. Cada ruta, recorrida por rol.
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const sql = (q: string) => execFileSync('psql', [`${PG}/${LAB_DB}`, '-Atc', q]).toString().trim();
const post = (page: Page, path: string, data: unknown) => page.request.post(`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });
const clubDay = (offset: number) => new Date(Date.now() - 3 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

/** Elige instalación, espacio y día esperando que cada elección quede marcada (son enlaces). */
async function openTurnero(page: Page, group: string, venue: string | null, dayIndex: number) {
  await page.goto(`${LAB_URL}/reservas`);
  const g = page.getByRole('group', { name: 'Instalación' }).getByRole('link', { name: new RegExp(`^${group}`) });
  await g.click();
  await expect(g).toHaveAttribute('aria-pressed', 'true');
  if (venue) {
    const v = page.getByRole('group', { name: 'Espacio' }).getByRole('link', { name: venue, exact: true });
    await v.click();
    await expect(v).toHaveAttribute('aria-pressed', 'true');
  }
  const d = page.getByRole('group', { name: 'Fecha' }).getByRole('link').nth(dayIndex);
  await d.click();
  await expect(d).toHaveAttribute('aria-pressed', 'true');
}

test('socia: reserva Pádel 2 con seña, paga con Mercado Pago y queda confirmada', async ({ page, browser }) => {
  await loginAs(page, 'Socio');
  await openTurnero(page, 'Pádel', 'Pádel 2', 3);
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: /^20:00 libre/ }).click();
  await expect(page.getByRole('heading', { name: 'Confirmar y pagar' })).toBeVisible();
  await expect(page.getByText('Tarifa socio')).toBeVisible();
  await page.getByRole('radio', { name: /Seña/ }).check();
  await expectNoHorizontalScroll(page);
  await page.getByRole('button', { name: /^Pagar \$ 4\.500 con Mercado Pago$/ }).click();
  await expect(page.getByRole('heading', { name: 'Checkout simulado' })).toBeVisible();

  // Mientras no paga, el turno está retenido: otra persona lo ve ocupado.
  const other = await browser.newPage();
  await loginAs(other, 'Coach');
  await openTurnero(other, 'Pádel', 'Pádel 2', 3);
  await expect(other.getByLabel('20:00 Reservado')).toBeVisible();

  const pref = (await (await page.request.get(`${MOCK_MP}/__last-preference`)).json()) as { external_reference: string };
  await page.request.post(`${MOCK_MP}/__payments`, { data: { id: '888001', status: 'approved', transaction_amount: 4500, external_reference: pref.external_reference } });
  const ts = String(Date.now());
  const v1 = createHmac('sha256', MP_WEBHOOK_SECRET).update(`id:888001;request-id:r-${ts};ts:${ts};`).digest('hex');
  const hook = await page.request.post(`${LAB_URL}/api/webhooks/mercadopago?data.id=888001&type=payment`, { headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': `r-${ts}` }, data: { type: 'payment', data: { id: '888001' } } });
  expect(await hook.json()).toMatchObject({ status: 'approved' });

  await expect
    .poll(async () => {
      await page.goto(`${LAB_URL}/reservas?vista=mias`);
      return page.getByRole('region', { name: /^Reserva Pádel 2/ }).getByText('Confirmada').count();
    })
    .toBeGreaterThan(0);
  await expect(page.getByText(/saldo \$ 4\.500 en el club/)).toBeVisible();
  await page.goto(`${LAB_URL}/avisos`);
  await expect(page.getByText('Reserva confirmada').first()).toBeVisible();
  await other.close();
});

test('socia: pagar en el club confirma al instante; cancelar a tiempo anula el cargo', async ({ page }) => {
  await loginAs(page, 'Socio');
  await openTurnero(page, 'Fútbol 5', 'F5-2', 4);
  await page.getByRole('link', { name: /^21:00 libre/ }).click();
  await page.getByRole('radio', { name: /Pagar en el club/ }).check();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(notice(page)).toContainText('Reserva confirmada');
  const card = page.getByRole('region', { name: /^Reserva F5-2/ });
  await expect(card.getByText('Confirmada')).toBeVisible();
  await expect(card.getByText(/a pagar \$ 18\.000/)).toBeVisible();
  await card.getByRole('button', { name: /^Cancelar reserva/ }).click();
  await card.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(card.getByText('Cancelada')).toBeVisible();
  expect(sql(`SELECT status FROM "Charge" WHERE description LIKE 'Reserva F5-2%' ORDER BY "createdAt" DESC LIMIT 1`)).toBe('cancelled');
  await expectNoHorizontalScroll(page);
});

test('encargado: agenda central con todos los módulos, bloqueo y estado físico', async ({ page }) => {
  await loginAs(page, 'Encargado de instalaciones');
  await page.goto(`${LAB_URL}/instalaciones?dia=${clubDay(1)}`);
  await expect(page.getByRole('heading', { name: 'Agenda central' })).toBeVisible();
  const f51 = page.getByRole('group', { name: 'F5-1' });
  await expect(f51.getByText('Mantenimiento del césped')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Pádel 2' }).getByText('Escuela').first()).toBeVisible();
  await expect(page.getByRole('group', { name: 'F5-2' }).getByText('Reserva')).toBeVisible();
  await expect(page.getByText('Gimnasio · Fuera de servicio (Reparación del piso)')).toBeVisible();
  await expectNoHorizontalScroll(page);

  const form = page.getByRole('form', { name: 'Nuevo bloqueo' });
  // Sobre una reserva confirmada (Valentina, F5-2 20:00): no pisa.
  await form.getByLabel('Espacio').selectOption({ label: 'F5-2' });
  await form.getByLabel('Día').fill(clubDay(1));
  await form.getByLabel('Desde').fill('19:30');
  await form.getByLabel('Hasta').fill('21:00');
  await form.getByLabel('Motivo').fill('Cambio de luminarias');
  await form.getByRole('button', { name: 'Bloquear' }).click();
  await expect(form.getByText(/Hay ocupaciones confirmadas/)).toBeVisible();
  await form.getByLabel('Desde').fill('15:00');
  await form.getByLabel('Hasta').fill('16:00');
  await form.getByRole('button', { name: 'Bloquear' }).click();
  await expect(page.getByText('Bloqueo cargado en la agenda.')).toBeVisible();
  await expect(page.getByRole('group', { name: 'F5-2' }).getByText('Cambio de luminarias')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar bloqueo: Cambio de luminarias' }).click();
  await expect(page.getByRole('group', { name: 'F5-2' }).getByText('Cambio de luminarias')).toHaveCount(0);
});

test('encargado: reglas y tarifas habilitan un espacio en el turnero; cancela una reserva del día', async ({ page }) => {
  await loginAs(page, 'Encargado de instalaciones');
  await page.goto(`${LAB_URL}/instalaciones/espacios`);
  const pileta = page.getByRole('region', { name: 'Pileta' });
  await expect(pileta.getByText('no se reserva online')).toBeVisible();
  await pileta.getByText('Editar reglas y tarifas').click();
  const rule = pileta.getByRole('form', { name: 'Reglas de Pileta' });
  await rule.getByLabel('Abre').fill('10:00');
  await rule.getByLabel('Cierra').fill('20:00');
  await rule.getByRole('button', { name: 'Guardar reglas' }).click();
  await expect(rule.getByText('Reglas guardadas.')).toBeVisible();
  const tariff = pileta.getByRole('form', { name: 'Nueva tarifa de Pileta' });
  await tariff.getByLabel('Nombre de la franja').fill('Andarivel');
  await tariff.getByLabel('Desde').fill('10:00');
  await tariff.getByLabel('Hasta').fill('20:00');
  await tariff.getByLabel('Precio socio ($)').fill('3.000');
  await tariff.getByLabel('Precio no socio ($)').fill('5.000');
  await tariff.getByRole('button', { name: 'Agregar tarifa' }).click();
  await expect(pileta.getByText('$ 3.000 socio · $ 5.000 no socio')).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto(`${LAB_URL}/reservas/gestion?dia=${clubDay(1)}`);
  const v = page.getByRole('region', { name: /^Reserva F5-2/ });
  await expect(v.getByText(/Valentina Rossi · \$ 18\.000 · paga en el club/)).toBeVisible();
  await v.getByRole('button', { name: /^Cancelar reserva/ }).click();
  await v.getByRole('button', { name: 'Sí, cancelar y avisar' }).click();
  await expect(v.getByText('Cancelada')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reintegros pendientes' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // La socia ya ve la pileta en el turnero.
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/reservas`);
  await expect(page.getByRole('group', { name: 'Instalación' }).getByRole('link', { name: /^Pileta/ })).toBeVisible();
});

test('recorrido por rol: cada uno ve y hace solo lo suyo', async ({ page }) => {
  const venue = sql(`SELECT id FROM "Venue" WHERE slug = 'padel-1'`);
  const lucas = sql(`SELECT b.id FROM "Booking" b JOIN "Person" p ON p.id = b."personId" WHERE p."firstName" = 'Lucas' AND p."lastName" = 'Benítez' LIMIT 1`);
  const block = { venueId: venue, day: clubDay(5), fromMinute: 600, toMinute: 660, reason: 'Prueba de permisos' };
  const status = async (path: string) => (await page.goto(`${LAB_URL}${path}`))!.status();

  await loginAs(page, 'Socio');
  for (const p of ['/instalaciones', '/instalaciones/espacios', '/reservas/gestion']) expect(await status(p), `Socio ${p}`).toBe(403);
  expect((await post(page, '/api/m/facilities/blocks', block)).status()).toBe(403);
  expect((await post(page, `/api/m/bookings/${lucas}/cancel`, {})).status()).toBe(403);

  for (const profile of ['Contabilidad', 'Recepción', 'Médico/Kine'] as const) {
    await loginAs(page, profile);
    expect(await status('/reservas'), `${profile} /reservas`).toBe(403);
    expect(await status('/instalaciones'), `${profile} /instalaciones`).toBe(403);
    expect((await post(page, '/api/m/bookings', { venueId: venue, startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), payMode: 'full' })).status(), profile).toBe(403);
  }

  await loginAs(page, 'Encargado de instalaciones');
  expect(await status('/instalaciones')).toBe(200);
  expect(await status('/reservas/gestion')).toBe(200);
  // El encargado administra, no reserva para sí (no es socio).
  expect(await status('/reservas')).toBe(403);

  await loginAs(page, 'Superadmin');
  for (const p of ['/instalaciones', '/instalaciones/espacios', '/reservas/gestion', '/reservas']) expect(await status(p), `Superadmin ${p}`).toBe(200);

  await page.context().clearCookies();
  expect((await page.request.get(`${LAB_URL}/api/m/bookings/availability?espacio=${venue}&dia=${clubDay(2)}`)).status()).toBe(401);
  await page.goto(`${LAB_URL}/reservas`);
  await expect(page).toHaveURL(/\/ingresar/);
});
