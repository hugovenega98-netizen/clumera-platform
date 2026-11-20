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
  // Después de la reserva de Valentina y fuera del torneo de los sábados (14 a 18): libre cualquier día.
  await form.getByLabel('Desde').fill('21:00');
  await form.getByLabel('Hasta').fill('22:00');
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

/** Aprueba en el Mercado Pago simulado el último checkout y manda el webhook firmado. */
async function approveLastCheckout(page: Page, paymentId: string, amount: number) {
  const pref = (await (await page.request.get(`${MOCK_MP}/__last-preference`)).json()) as { external_reference: string };
  await page.request.post(`${MOCK_MP}/__payments`, { data: { id: paymentId, status: 'approved', transaction_amount: amount, external_reference: pref.external_reference } });
  const ts = String(Date.now());
  const v1 = createHmac('sha256', MP_WEBHOOK_SECRET).update(`id:${paymentId};request-id:r-${ts};ts:${ts};`).digest('hex');
  const hook = await page.request.post(`${LAB_URL}/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`, { headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': `r-${ts}` }, data: { type: 'payment', data: { id: paymentId } } });
  expect(await hook.json()).toMatchObject({ status: 'approved' });
}

test('público: reserva sin cuenta con seña, paga, recibe el enlace por correo y cancela', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`${LAB_URL}/ingresar`);
  await page.getByRole('link', { name: 'Reservá una cancha sin cuenta' }).click();
  await expect(page.getByRole('heading', { name: 'Reservá una cancha' })).toBeVisible();
  await expect(page.getByText('No hace falta ser socio ni crear una cuenta.')).toBeVisible();
  // Solo los espacios habilitados para el público (Fútbol 5); Pádel no.
  await expect(page.getByRole('group', { name: 'Instalación' }).getByRole('link', { name: /^Pádel/ })).toHaveCount(0);
  const v = page.getByRole('group', { name: 'Espacio' }).getByRole('link', { name: 'F5-1', exact: true });
  await v.click();
  await expect(v).toHaveAttribute('aria-pressed', 'true');
  const d = page.getByRole('group', { name: 'Fecha' }).getByRole('link').nth(3);
  await d.click();
  await expect(d).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalScroll(page);
  await page.getByRole('link', { name: /^21:00 libre/ }).click();

  await expect(page.getByRole('heading', { name: 'Reservá sin cuenta' })).toBeVisible();
  await expect(page.getByText('Tarifa general')).toBeVisible();
  const form = page.getByRole('form', { name: 'Reservar sin cuenta' });
  await form.getByLabel('Nombre y apellido').fill('Julia Invitada');
  await form.getByLabel('Celular (WhatsApp)').fill('11 5555 0199');
  // Con el email de una socia, la manda a ingresar: nunca carga cargos en la cuenta de otra persona.
  await form.getByLabel('Email').fill('socio@lab.clumera.app');
  await form.getByLabel(/Acepto las condiciones/).check();
  await form.getByRole('button', { name: 'Pagar seña $ 7.200' }).click();
  await expect(form.getByRole('alert')).toContainText('Ese email es de una persona del club');
  await expect(form.getByRole('link', { name: 'Ingresar' })).toBeVisible();
  await form.getByLabel('Email').fill('julia.invitada@example.com');
  await expectNoHorizontalScroll(page);
  await form.getByRole('button', { name: 'Pagar seña $ 7.200' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout simulado' })).toBeVisible();
  await approveLastCheckout(page, '888101', 7200);

  // El enlace firmado llega por correo; abre la reserva sin cuenta.
  let link = '';
  await expect
    .poll(() => {
      link = sql(`SELECT substring(text from '/reservar/r/[A-Za-z0-9_.-]+') FROM "DevMailMessage" WHERE "to" = 'julia.invitada@example.com' AND subject LIKE '%Reserva confirmada%' ORDER BY "createdAt" DESC LIMIT 1`);
      return link;
    })
    .toMatch(/^\/reservar\/r\//);
  await page.goto(`${LAB_URL}${link}`);
  const card = page.getByRole('region', { name: /^Reserva F5-1/ });
  await expect(card.getByText('Confirmada')).toBeVisible();
  await expect(card.getByText('$ 16.800')).toBeVisible(); // saldo en el club
  await expectNoHorizontalScroll(page);
  // Un enlace adulterado no abre nada.
  expect((await page.goto(`${LAB_URL}${link.slice(0, -2)}xx`))!.status()).toBe(404);

  await page.goto(`${LAB_URL}${link}`);
  await card.getByRole('button', { name: /^Cancelar reserva/ }).click();
  await card.getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(card.getByText('Cancelada')).toBeVisible();
  await expect(card.getByText('El club te devuelve $ 7.200.')).toBeVisible();

  // Con sesión, /reservar lleva al turnero del club (tarifa socio).
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/reservar`);
  await expect(page).toHaveURL(/\/reservas$/);
});

test('encargado: reserva fija semanal, salta la semana ocupada y se cancela entera', async ({ page }) => {
  await loginAs(page, 'Encargado de instalaciones');
  await page.goto(`${LAB_URL}/reservas/fijas`);
  await expect(page.getByRole('region', { name: /^Reserva fija Pádel 1 Martes 22:00/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar persona' }).fill('Fernández');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: 'Elegir a Ana Fernández' }).click();
  const form = page.getByRole('form', { name: 'Reserva fija para Ana Fernández' });
  await expectNoHorizontalScroll(page);
  // Pádel 2, el día de la semana de la reserva de Lucas (confirmada, 19:00): esa semana no se pisa.
  const lucasDay = sql(`SELECT (extract(isodow from (b."startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Argentina/Buenos_Aires') - 1)::int FROM "Booking" b JOIN "Person" p ON p.id = b."personId" WHERE p."firstName" = 'Lucas' AND p."lastName" = 'Benítez' LIMIT 1`);
  await form.getByLabel('Espacio').selectOption({ label: 'Pádel 2' });
  await form.getByLabel('Día').selectOption(lucasDay);
  await form.getByLabel('Turno').selectOption('19:00');
  await form.getByLabel('Desde').fill(clubDay(0));
  await form.getByLabel('Hasta').fill(clubDay(27));
  await form.getByRole('button', { name: 'Cargar reserva fija' }).click();
  const done = form.getByRole('alert');
  await expect(done).toContainText(/Reserva fija cargada: \d+ semanas?\. No se reservaron/);
  const weeks = Number(/cargada: (\d+)/.exec((await done.textContent()) ?? '')![1]);
  expect(weeks).toBeGreaterThanOrEqual(2);
  const card = page.getByRole('region', { name: /^Reserva fija Pádel 2/ });
  await expect(card.getByText(new RegExp(`${weeks} semanas pendientes`))).toBeVisible();
  await expectNoHorizontalScroll(page);

  // La socia lo ve en «Mis reservas» con un solo aviso (no uno por semana).
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/avisos`);
  await expect(page.getByText('Te cargaron una reserva fija')).toHaveCount(1);
  await page.goto(`${LAB_URL}/reservas?vista=mias`);
  // Más la reserva con seña del primer recorrido.
  await expect(page.getByRole('region', { name: /^Reserva Pádel 2/ })).toHaveCount(weeks + 1);

  await loginAs(page, 'Encargado de instalaciones');
  await page.goto(`${LAB_URL}/reservas/fijas`);
  await card.getByRole('button', { name: /^Cancelar reserva fija/ }).click();
  await card.getByRole('button', { name: `Sí, cancelar ${weeks} semanas` }).click();
  await expect(card).toHaveCount(0);
  expect(sql(`SELECT count(*) FROM "Charge" WHERE description LIKE 'Reserva Pádel 2%' AND status = 'cancelled' AND "personId" = (SELECT id FROM "Person" WHERE "firstName" = 'Ana' AND "lastName" = 'Fernández' LIMIT 1)`)).toBe(String(weeks));
});

test('recorrido por rol: cada uno ve y hace solo lo suyo', async ({ page }) => {
  const venue = sql(`SELECT id FROM "Venue" WHERE slug = 'padel-1'`);
  const lucas = sql(`SELECT b.id FROM "Booking" b JOIN "Person" p ON p.id = b."personId" WHERE p."firstName" = 'Lucas' AND p."lastName" = 'Benítez' LIMIT 1`);
  const block = { venueId: venue, day: clubDay(5), fromMinute: 600, toMinute: 660, reason: 'Prueba de permisos' };
  const status = async (path: string) => (await page.goto(`${LAB_URL}${path}`))!.status();

  await loginAs(page, 'Socio');
  for (const p of ['/instalaciones', '/instalaciones/espacios', '/reservas/gestion', '/reservas/fijas']) expect(await status(p), `Socio ${p}`).toBe(403);
  expect((await post(page, '/api/m/facilities/blocks', block)).status()).toBe(403);
  const series = { venueId: venue, personId: sql(`SELECT id FROM "Person" WHERE "firstName" = 'Ana' AND "lastName" = 'Fernández' LIMIT 1`), weekday: 2, time: '10:00', fromDay: clubDay(0), untilDay: clubDay(14) };
  expect((await post(page, '/api/m/bookings/series', series)).status()).toBe(403);
  const seriesId = sql(`SELECT id FROM "BookingSeries" WHERE status = 'active' LIMIT 1`);
  expect((await post(page, `/api/m/bookings/series/${seriesId}/cancel`, {})).status()).toBe(403);
  expect((await post(page, `/api/m/bookings/${lucas}/cancel`, {})).status()).toBe(403);

  for (const profile of ['Contabilidad', 'Recepción', 'Médico/Kine'] as const) {
    await loginAs(page, profile);
    expect(await status('/reservas'), `${profile} /reservas`).toBe(403);
    expect(await status('/reservas/fijas'), `${profile} /reservas/fijas`).toBe(403);
    expect(await status('/instalaciones'), `${profile} /instalaciones`).toBe(403);
    expect((await post(page, '/api/m/bookings', { venueId: venue, startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), payMode: 'full' })).status(), profile).toBe(403);
  }

  await loginAs(page, 'Encargado de instalaciones');
  expect(await status('/instalaciones')).toBe(200);
  expect(await status('/reservas/gestion')).toBe(200);
  expect(await status('/reservas/fijas')).toBe(200);
  // El encargado administra, no reserva para sí (no es socio).
  expect(await status('/reservas')).toBe(403);

  await loginAs(page, 'Superadmin');
  for (const p of ['/instalaciones', '/instalaciones/espacios', '/reservas/gestion', '/reservas/fijas', '/reservas']) expect(await status(p), `Superadmin ${p}`).toBe(200);

  await page.context().clearCookies();
  expect((await page.request.get(`${LAB_URL}/api/m/bookings/availability?espacio=${venue}&dia=${clubDay(2)}`)).status()).toBe(401);
  await page.goto(`${LAB_URL}/reservas`);
  await expect(page).toHaveURL(/\/ingresar/);
  // Sin sesión: la reserva pública sí; la gestión y las reservas fijas, no.
  expect(await status('/reservar')).toBe(200);
  expect((await post(page, '/api/m/bookings/series', series)).status()).toBe(401);
  await page.goto(`${LAB_URL}/reservas/fijas`);
  await expect(page).toHaveURL(/\/ingresar/);
  // Un espacio no habilitado para el público no se reserva sin cuenta (Pádel 1).
  const pub = { venueId: venue, startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), payMode: 'full', name: 'Nadie Prueba', phone: '1155550000', email: 'nadie@example.com', terms: true };
  expect((await post(page, '/api/m/bookings/public', pub)).status()).toBe(404);
  expect((await post(page, '/api/m/bookings/public', { ...pub, terms: false })).status()).toBe(400);
});
