import { applyGatewayUpdate } from '@clumera/finance';
import { after, NextResponse } from 'next/server';
import { deliverNow } from '@/lib/consumers';
import { getPrisma } from '@/lib/db';
import { errorResponse } from '@/lib/http';
import { getGateway } from '@/lib/services';

/**
 * Webhook de Mercado Pago. Firma obligatoria; el estado y el monto se leen de la API (nunca del
 * cuerpo). Idempotente: los reintentos y duplicados quedan en la bitácora del pago.
 */
export async function POST(request: Request) {
  const gateway = getGateway();
  if (!gateway) return errorResponse('not_configured', 'Pasarela no configurada', 503);
  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as { type?: string; data?: { id?: string | number } };
  const dataId = url.searchParams.get('data.id') ?? (body.data?.id != null ? String(body.data.id) : null);
  const type = url.searchParams.get('type') ?? body.type;
  if (!gateway.verifyWebhook({ signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id'), dataId })) {
    return errorResponse('invalid_signature', 'Firma inválida', 401);
  }
  if (type !== 'payment' || !dataId) return NextResponse.json({ ignored: true });
  let payment;
  try {
    payment = await gateway.fetchPayment(dataId);
  } catch {
    // Mercado Pago reintenta ante un error: no se pierde la notificación.
    return errorResponse('gateway_error', 'No se pudo consultar el pago', 502);
  }
  if (!payment.externalReference) return NextResponse.json({ ignored: true });
  const r = await applyGatewayUpdate(getPrisma(), { paymentId: payment.externalReference, providerRef: payment.providerRef, status: payment.status, amount: payment.amount });
  if (!r.ok) return NextResponse.json({ ignored: true, reason: r.error.code });
  // El aviso «pago acreditado» sale enseguida; si falla, lo repasa el cron.
  if (r.ok) after(() => deliverNow(getPrisma()).catch(() => undefined));
  return NextResponse.json(r.value);
}
