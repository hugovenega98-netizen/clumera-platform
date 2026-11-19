import { startOnlinePayment } from '@clumera/finance';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/db';
import { payableBy } from '@/lib/finance-access';
import { domainErrorResponse, errorResponse, parseJson } from '@/lib/http';
import { appOrigin, getGateway } from '@/lib/services';
import { getCurrentSession } from '@/lib/session';

/**
 * Inicia el pago online de cargos propios o de los representados. Devuelve el enlace de la
 * pasarela. El servicio se confirma recién con el webhook `approved`, nunca con el regreso.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) return errorResponse('unauthenticated', 'Ingresá para continuar', 401);
  const gateway = getGateway();
  if (!gateway) return errorResponse('not_configured', 'El pago online todavía no está habilitado en el club', 503);
  const body = await parseJson(request, z.object({ chargeIds: z.array(z.string().min(1)).min(1).max(50) }));
  if (!body.ok) return body.response;
  if (!(await payableBy(session.personId, body.data.chargeIds))) return errorResponse('forbidden', 'Solo podés pagar cargos tuyos o de tu familia a cargo', 403);
  const db = getPrisma();
  const started = await startOnlinePayment(db, { payerPersonId: session.personId, chargeIds: body.data.chargeIds, provider: gateway.name });
  if (!started.ok) return domainErrorResponse(started.error);
  const payer = await db.person.findUnique({ where: { id: session.personId }, select: { email: true } });
  try {
    const origin = appOrigin();
    const { checkoutUrl, preferenceId } = await gateway.createCheckout({
      paymentId: started.value.id,
      items: started.value.charges.map((c) => ({ id: c.id, title: c.description, amount: c.amount })),
      // Con credenciales de prueba, el comprador tiene que ser de prueba (un email real hace fallar el checkout).
      payerEmail: process.env.MP_TEST_PAYER_EMAIL?.trim() || payer?.email,
      backUrl: `${origin}/pagos?pago=${started.value.id}`,
      notificationUrl: `${origin}/api/webhooks/mercadopago`,
    });
    await db.paymentEvent.create({ data: { paymentId: started.value.id, kind: 'preference_created', detail: { preferenceId } } });
    return NextResponse.json({ checkoutUrl }, { status: 201 });
  } catch {
    await db.payment.update({ where: { id: started.value.id }, data: { status: 'rejected' } });
    await db.paymentEvent.create({ data: { paymentId: started.value.id, kind: 'preference_failed' } });
    return errorResponse('gateway_error', 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.', 502);
  }
}
