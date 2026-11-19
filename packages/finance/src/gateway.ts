/**
 * Pasarela de pago. Hoy, Mercado Pago (Checkout Pro). La aplicación nunca confía en el retorno del
 * navegador ni en el cuerpo del webhook: valida la firma y consulta el pago en la API antes de
 * aprobar nada.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GatewayStatus } from './ledger';

export interface CheckoutRequest {
  /** Nuestro id de pago: viaja como external_reference e idempotency key. */
  paymentId: string;
  items: Array<{ id: string; title: string; amount: number }>;
  payerEmail?: string | null;
  backUrl: string;
  notificationUrl: string;
}

export interface GatewayPayment {
  providerRef: string;
  status: GatewayStatus;
  amount: number;
  externalReference: string | null;
}

export interface PaymentGateway {
  readonly name: 'mercadopago';
  createCheckout(req: CheckoutRequest): Promise<{ checkoutUrl: string; preferenceId: string }>;
  fetchPayment(providerRef: string): Promise<GatewayPayment>;
  /** Firma `x-signature` del webhook (HMAC-SHA256 del manifiesto id/request-id/ts). */
  verifyWebhook(input: { signature: string | null; requestId: string | null; dataId: string | null; now?: Date }): boolean;
}

export interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
  /** Tolerancia del `ts` de la firma (anti-reproducción). */
  maxSignatureAgeSeconds?: number;
  fetch?: typeof fetch;
  apiBase?: string;
}

const STATUSES: Record<string, GatewayStatus> = {
  approved: 'approved',
  authorized: 'pending',
  pending: 'pending',
  in_process: 'in_process',
  in_mediation: 'in_process',
  rejected: 'rejected',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'charged_back',
};

export function createMercadoPagoGateway(config: MercadoPagoConfig): PaymentGateway {
  const doFetch = config.fetch ?? fetch;
  const api = (config.apiBase ?? 'https://api.mercadopago.com').replace(/\/+$/, '');
  const headers = { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json' };

  return {
    name: 'mercadopago',

    async createCheckout(req) {
      const res = await doFetch(`${api}/checkout/preferences`, {
        method: 'POST',
        headers: { ...headers, 'x-idempotency-key': req.paymentId },
        body: JSON.stringify({
          items: req.items.map((i) => ({ id: i.id, title: i.title.slice(0, 250), quantity: 1, currency_id: 'ARS', unit_price: i.amount / 100 })),
          external_reference: req.paymentId,
          payer: req.payerEmail ? { email: req.payerEmail } : undefined,
          back_urls: { success: req.backUrl, pending: req.backUrl, failure: req.backUrl },
          auto_return: 'approved',
          notification_url: req.notificationUrl,
          binary_mode: false,
        }),
      });
      if (!res.ok) throw new Error(`Mercado Pago rechazó la preferencia (${res.status})`);
      const body = (await res.json()) as { id?: string; init_point?: string };
      if (!body.id || !body.init_point) throw new Error('Mercado Pago no devolvió el enlace de pago');
      return { checkoutUrl: body.init_point, preferenceId: body.id };
    },

    async fetchPayment(providerRef) {
      if (!/^\d{1,20}$/.test(providerRef)) throw new Error('Id de pago de Mercado Pago inválido');
      const res = await doFetch(`${api}/v1/payments/${providerRef}`, { headers });
      if (!res.ok) throw new Error(`No se pudo consultar el pago (${res.status})`);
      const body = (await res.json()) as { id: number | string; status: string; transaction_amount: number; external_reference?: string | null };
      return {
        providerRef: String(body.id),
        status: STATUSES[body.status] ?? 'pending',
        amount: Math.round(Number(body.transaction_amount) * 100),
        externalReference: body.external_reference ?? null,
      };
    },

    verifyWebhook({ signature, requestId, dataId, now = new Date() }) {
      if (!signature) return false;
      const parts = Object.fromEntries(
        signature.split(',').map((kv) => {
          const [k, ...v] = kv.trim().split('=');
          return [k, v.join('=')];
        }),
      );
      const ts = parts.ts;
      const v1 = parts.v1;
      if (!ts || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
      // ts puede venir en segundos o en milisegundos.
      const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
      if (!Number.isFinite(tsMs) || Math.abs(now.getTime() - tsMs) > (config.maxSignatureAgeSeconds ?? 600) * 1000) return false;
      let manifest = '';
      if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
      if (requestId) manifest += `request-id:${requestId};`;
      manifest += `ts:${ts};`;
      const expected = createHmac('sha256', config.webhookSecret).update(manifest).digest();
      const given = Buffer.from(v1, 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    },
  };
}

/** Pasarela desde el entorno de la instalación; null si el club no la configuró. */
export function gatewayFromEnv(env: Record<string, string | undefined>): PaymentGateway | null {
  const accessToken = env.MP_ACCESS_TOKEN?.trim();
  const webhookSecret = env.MP_WEBHOOK_SECRET?.trim();
  if (!accessToken || !webhookSecret) return null;
  // MP_API_BASE solo para pruebas (simulador local); en producción, la API de Mercado Pago.
  return createMercadoPagoGateway({ accessToken, webhookSecret, apiBase: env.MP_API_BASE?.trim() || undefined });
}
