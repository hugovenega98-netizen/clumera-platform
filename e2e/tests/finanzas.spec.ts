import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { LAB_URL, MOCK_MP, MP_WEBHOOK_SECRET } from '../env';
import { expectNoHorizontalScroll, loginAs, notice, restoreLab } from './helpers';

/**
 * Hito A · Finanzas con los perfiles de Lab: cuenta unificada del socio, cobro en caja con
 * comprobante, cuotas y cargos de Contabilidad, y pago online contra un Mercado Pago simulado
 * (el servicio se confirma solo con el webhook firmado, nunca con el regreso).
 */
test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await restoreLab(page);
  await page.close();
});

const post = (page: Page, path: string, data: unknown) => page.request.post(`${LAB_URL}${path}`, { headers: { origin: LAB_URL }, data });

async function personId(page: Page, q: string): Promise<string> {
  await page.goto(`${LAB_URL}/admin/finanzas?q=${encodeURIComponent(q)}`);
  const href = await page.getByRole('link', { name: new RegExp(q.split(' ')[0]!, 'i') }).first().getAttribute('href');
  return href!.split('/').pop()!;
}

test('socia: cuenta unificada con lo suyo y lo de su hijo', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/pagos`);
  const summary = page.getByRole('region', { name: 'Resumen de la cuenta' });
  await expect(summary.getByText('Pendiente del grupo')).toBeVisible();
  await expect(summary.getByText('$ 92.500')).toBeVisible(); // 22.000 + 18.500 + 12.000 + 40.000
  await expect(page.getByRole('region', { name: 'Tomás · Colonia de verano' }).getByText('$ 40.000')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hockey' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole('navigation', { name: 'Vista de pagos' }).getByRole('link', { name: /Historial/ }).click();
  const receipt = page.getByRole('link', { name: /^R-\d{6}$/ }).first();
  await receipt.click();
  await expect(page.getByRole('heading', { name: /Comprobante R-\d{6}/ })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Conceptos' })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('cuentas ajenas: 403; la del hijo a cargo, sí', async ({ page, browser }) => {
  const admin = await browser.newPage();
  await loginAs(admin, 'Superadmin');
  const martina = await personId(admin, 'Gómez Martina');
  const tomas = await personId(admin, 'Fernández Tomás');
  const ana = await personId(admin, 'Fernández Ana');
  await admin.close();

  await loginAs(page, 'Socio');
  expect((await page.request.get(`${LAB_URL}/api/finance/accounts/${martina}`)).status()).toBe(403);
  expect((await page.request.get(`${LAB_URL}/api/finance/accounts/${tomas}`)).status()).toBe(200);
  for (const profile of ['Coach', 'Recepción', 'Médico/Kine'] as const) {
    await loginAs(page, profile);
    expect((await page.request.get(`${LAB_URL}/api/finance/accounts/${ana}`)).status(), profile).toBe(403);
  }
  await loginAs(page, 'Caja');
  expect((await page.request.get(`${LAB_URL}/api/finance/accounts/${ana}`)).status()).toBe(200);
});

test('caja: busca la cuenta, cobra en efectivo y emite el comprobante', async ({ page }) => {
  await loginAs(page, 'Caja');
  await page.goto(`${LAB_URL}/admin`);
  await expect(page).toHaveURL(`${LAB_URL}/admin/finanzas`);
  await expect(page.getByRole('region', { name: 'Finanzas del mes' })).toHaveCount(0);
  await expect(page.getByRole('form', { name: 'Emitir cuotas del mes' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Buscar cuenta' }).fill('fernandez');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: 'Fernández, Ana' }).click();
  await expect(page.getByRole('heading', { name: 'Ana Fernández', level: 1 })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Emitir cargo' })).toHaveCount(0);

  await page.getByRole('checkbox', { name: /Cobrar Arancel/ }).check();
  const form = page.getByRole('form', { name: 'Registrar cobro' });
  await expect(form.getByRole('heading')).toHaveText('Registrar cobro · $ 18.500');
  await form.getByLabel('Medio').selectOption('cash');
  await form.getByRole('button', { name: 'Registrar cobro' }).click();
  await expect(notice(page)).toContainText('Cobro registrado.');
  await notice(page).getByRole('link', { name: /Ver comprobante R-\d{6}/ }).click();
  const lines = page.getByRole('table', { name: 'Conceptos' });
  await expect(lines.getByRole('row', { name: /Arancel .*Ana Fernández.*\$ 18\.500/ })).toBeVisible();
  await expect(page.getByText('Efectivo')).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('contabilidad: números del mes, cuotas idempotentes, emitir y anular un cargo', async ({ page }) => {
  await loginAs(page, 'Contabilidad');
  await page.goto(`${LAB_URL}/admin/finanzas`);
  const kpis = page.getByRole('region', { name: 'Finanzas del mes' });
  await expect(kpis.getByText('Cobrado este mes')).toBeVisible();
  await expect(kpis.getByText('Morosidad (+21 días)')).toBeVisible();

  const dues = page.getByRole('form', { name: 'Emitir cuotas del mes' });
  await dues.getByRole('button', { name: 'Emitir cuotas' }).click();
  await expect(dues.locator('.cx-notice')).toContainText('No había cuotas nuevas');

  await page.getByRole('searchbox', { name: 'Buscar cuenta' }).fill('martina');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: 'Gómez, Martina' }).click();
  const issue = page.getByRole('form', { name: 'Emitir cargo' });
  await issue.getByLabel('Agrupar como').fill('Servicios');
  await issue.getByLabel('Concepto').fill('Alquiler de quincho');
  await issue.getByLabel('Monto').fill('35.000');
  await issue.getByLabel('Vence').fill('2027-01-15');
  await issue.getByRole('button', { name: 'Emitir cargo' }).click();
  await expect(issue.locator('.cx-notice')).toHaveText('Cargo emitido.');
  const ledger = page.getByRole('table', { name: 'Cuenta por concepto' });
  await expect(ledger.getByRole('cell', { name: 'Alquiler de quincho', exact: true })).toBeVisible();

  await ledger.getByRole('button', { name: 'Anular Alquiler de quincho' }).click();
  const cancel = page.getByRole('form', { name: 'Anular cargo' });
  await cancel.getByLabel('Motivo').fill('Cargado por error');
  await cancel.getByRole('button', { name: 'Confirmar anulación' }).click();
  await expect(ledger.getByRole('cell', { name: 'Alquiler de quincho', exact: true })).toHaveCount(0);
});

test('permisos de escritura por rol', async ({ page }) => {
  const cases: Array<[string, string, number]> = [
    ['Socio', '/api/finance/payments', 403],
    ['Recepción', '/api/finance/payments', 403],
    ['Coach', '/api/finance/payments', 403],
    ['Caja', '/api/finance/charges', 403],
    ['Caja', '/api/finance/dues', 403],
    ['Socio', '/api/finance/dues', 403],
    ['Contabilidad', '/api/finance/dues', 400], // autorizado: llega a validar los datos
  ];
  for (const [profile, path, status] of cases) {
    await loginAs(page, profile);
    expect((await post(page, path, {})).status(), `${profile} ${path}`).toBe(status);
  }
  for (const profile of ['Recepción', 'Coach', 'Socio'] as const) {
    await loginAs(page, profile);
    expect((await page.goto(`${LAB_URL}/admin/finanzas`))!.status(), profile).toBe(403);
  }
});

test('pago online: el regreso no confirma; el webhook firmado sí, y una sola vez', async ({ page }) => {
  await loginAs(page, 'Socio');
  await page.goto(`${LAB_URL}/pagos`);
  // Solo la colonia (los vencidos vienen preseleccionados).
  const boxes = page.getByRole('checkbox', { name: /^Pagar / });
  for (let i = 0; i < (await boxes.count()); i++) {
    const box = boxes.nth(i);
    await box.setChecked(((await box.getAttribute('aria-label')) ?? '').includes('Colonia'));
  }
  await page.getByRole('button', { name: 'Pagar seleccionados · $ 40.000' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout simulado' })).toBeVisible();

  const pref = (await (await page.request.get(`${MOCK_MP}/__last-preference`)).json()) as { external_reference: string };
  const paymentId = pref.external_reference;
  // Vuelve de la pasarela: sigue en verificación.
  await page.goto(`${LAB_URL}/pagos?pago=${paymentId}`);
  await expect(notice(page)).toContainText('Estamos verificando el pago');
  await expect(page.getByRole('region', { name: 'Resumen de la cuenta' }).getByText('En verificación')).toBeVisible();

  const webhook = async (signed = true) => {
    const ts = String(Date.now());
    const requestId = `req-${ts}`;
    const v1 = createHmac('sha256', signed ? MP_WEBHOOK_SECRET : 'otra').update(`id:777001;request-id:${requestId};ts:${ts};`).digest('hex');
    return page.request.post(`${LAB_URL}/api/webhooks/mercadopago?data.id=777001&type=payment`, {
      headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
      data: { type: 'payment', data: { id: '777001' } },
    });
  };
  await page.request.post(`${MOCK_MP}/__payments`, { data: { id: '777001', status: 'approved', transaction_amount: 40000, external_reference: paymentId } });
  expect((await webhook(false)).status()).toBe(401);
  expect(await (await webhook()).json()).toMatchObject({ changed: true, status: 'approved' });
  expect(await (await webhook()).json()).toMatchObject({ changed: false });

  await page.goto(`${LAB_URL}/pagos?pago=${paymentId}`);
  await expect(notice(page)).toContainText('Pago acreditado');
  await expect(page.getByRole('region', { name: 'Tomás · Colonia de verano' })).toHaveCount(0);

  // Aviso «Pago acreditado» en la bandeja (entrega inmediata tras el webhook).
  await expect.poll(async () => {
    await page.goto(`${LAB_URL}/avisos`);
    return page.getByText('Pago acreditado').count();
  }).toBeGreaterThan(0);

  // Conciliación: Contabilidad ve la bitácora con el duplicado ignorado.
  await loginAs(page, 'Contabilidad');
  await page.goto(`${LAB_URL}/admin/finanzas`);
  await expect(page.getByText('Pagos online en verificación')).toBeVisible();
});

test('checkout: solo cargos propios o de la familia a cargo', async ({ page, browser }) => {
  const admin = await browser.newPage();
  await loginAs(admin, 'Superadmin');
  const martina = await personId(admin, 'Gómez Martina');
  const acc = (await (await admin.request.get(`${LAB_URL}/api/finance/accounts/${martina}`)).json()) as { people: Array<{ groups: Array<{ charges: Array<{ id: string; status: string }> }> }> };
  const foreign = acc.people[0]!.groups.flatMap((g) => g.charges).find((c) => c.status === 'pending')!.id;
  await admin.close();
  await loginAs(page, 'Socio');
  expect((await post(page, '/api/finance/checkout', { chargeIds: [foreign] })).status()).toBe(403);
  await page.context().clearCookies();
  expect((await post(page, '/api/finance/checkout', { chargeIds: [foreign] })).status()).toBe(401);
});
