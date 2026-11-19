import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createMercadoPagoGateway, formatMoney, gatewayFromEnv, parseMoney, periodLabel, receiptNumber } from '../src';

const secret = 'secreto-del-webhook';
const sign = (manifest: string) => createHmac('sha256', secret).update(manifest).digest('hex');

describe('Mercado Pago', () => {
  const now = new Date('2026-11-19T15:00:00Z');
  const ts = String(now.getTime());

  it('valida la firma del webhook y rechaza alteradas, viejas o sin firma', () => {
    const gw = createMercadoPagoGateway({ accessToken: 't', webhookSecret: secret });
    const good = `ts=${ts},v1=${sign(`id:123456;request-id:req-1;ts:${ts};`)}`;
    expect(gw.verifyWebhook({ signature: good, requestId: 'req-1', dataId: '123456', now })).toBe(true);
    expect(gw.verifyWebhook({ signature: good, requestId: 'req-1', dataId: '999', now })).toBe(false);
    expect(gw.verifyWebhook({ signature: good, requestId: 'req-2', dataId: '123456', now })).toBe(false);
    expect(gw.verifyWebhook({ signature: good, requestId: 'req-1', dataId: '123456', now: new Date(now.getTime() + 3_600_000) })).toBe(false);
    expect(gw.verifyWebhook({ signature: null, requestId: 'req-1', dataId: '123456', now })).toBe(false);
    expect(gw.verifyWebhook({ signature: 'ts=1,v1=zz', requestId: null, dataId: null, now })).toBe(false);
    // Ids alfanuméricos van en minúsculas en el manifiesto.
    const alpha = `ts=${ts},v1=${sign(`id:ord01abc;request-id:r;ts:${ts};`)}`;
    expect(gw.verifyWebhook({ signature: alpha, requestId: 'r', dataId: 'ORD01ABC', now })).toBe(true);
  });

  it('crea la preferencia con external_reference e idempotencia, y consulta el pago', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/checkout/preferences')) {
        const body = JSON.parse(String(init!.body));
        expect(body).toMatchObject({ external_reference: 'pay_1', items: [{ unit_price: 18500, currency_id: 'ARS', quantity: 1 }], notification_url: 'https://club/api/finance/webhooks/mercadopago' });
        expect((init!.headers as Record<string, string>)['x-idempotency-key']).toBe('pay_1');
        return new Response(JSON.stringify({ id: 'pref_1', init_point: 'https://mp/checkout/pref_1' }), { status: 201 });
      }
      return new Response(JSON.stringify({ id: 88340, status: 'approved', transaction_amount: 18500.5, external_reference: 'pay_1' }));
    });
    const gw = createMercadoPagoGateway({ accessToken: 'TEST-1', webhookSecret: secret, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(await gw.createCheckout({ paymentId: 'pay_1', items: [{ id: 'c1', title: 'Arancel', amount: 18_500_00 }], backUrl: 'https://club/pagos', notificationUrl: 'https://club/api/finance/webhooks/mercadopago' })).toEqual({ checkoutUrl: 'https://mp/checkout/pref_1', preferenceId: 'pref_1' });
    expect(await gw.fetchPayment('88340')).toEqual({ providerRef: '88340', status: 'approved', amount: 18_500_50, externalReference: 'pay_1' });
    await expect(gw.fetchPayment('../../users/me')).rejects.toThrow();
  });

  it('sin credenciales, la pasarela queda apagada', () => {
    expect(gatewayFromEnv({})).toBeNull();
    expect(gatewayFromEnv({ MP_ACCESS_TOKEN: 'x' })).toBeNull();
    expect(gatewayFromEnv({ MP_ACCESS_TOKEN: 'x', MP_WEBHOOK_SECRET: 'y' })).not.toBeNull();
  });
});

describe('dinero', () => {
  it('formatea y lee montos en pesos sin flotantes', () => {
    expect(formatMoney(18_500_00)).toBe('$ 18.500');
    expect(formatMoney(18_500_50)).toBe('$ 18.500,50');
    expect(parseMoney('18.500')).toBe(18_500_00);
    expect(parseMoney('$ 18500,50')).toBe(18_500_50);
    expect(parseMoney('18,5,0')).toBeNull();
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(receiptNumber(42)).toBe('R-000042');
    expect(periodLabel('2026-11')).toBe('Noviembre 2026');
  });
});
