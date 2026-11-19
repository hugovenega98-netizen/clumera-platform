/**
 * Simulador local de la API de Mercado Pago para e2e: crea preferencias y devuelve pagos que la
 * prueba define. Nunca se usa fuera de las pruebas (MP_API_BASE apunta acá solo en e2e).
 */
import { createServer, type Server } from 'node:http';

export const MOCK_MP_URL = 'http://localhost:3500';

interface MockPayment {
  id: string;
  status: string;
  transaction_amount: number;
  external_reference: string;
}

export function startMockMercadoPago(): Server {
  const preferences: Array<{ id: string; external_reference: string; items: Array<{ unit_price: number }> }> = [];
  const payments = new Map<string, MockPayment>();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    const url = new URL(req.url ?? '/', MOCK_MP_URL);
    if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
      if (req.headers.authorization !== 'Bearer TEST-e2e') return send(401, { message: 'invalid token' });
      const id = `pref_${preferences.length + 1}`;
      preferences.push({ id, ...body });
      return send(201, { id, init_point: `${MOCK_MP_URL}/checkout/${id}` });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/checkout/')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><title>Mercado Pago (simulado)</title><h1>Checkout simulado</h1>');
    }
    const m = url.pathname.match(/^\/v1\/payments\/(\d+)$/);
    if (req.method === 'GET' && m) {
      const p = payments.get(m[1]!);
      return p ? send(200, p) : send(404, { message: 'not found' });
    }
    // Control de la prueba.
    if (req.method === 'GET' && url.pathname === '/__last-preference') return send(200, preferences.at(-1) ?? null);
    if (req.method === 'POST' && url.pathname === '/__payments') {
      payments.set(String(body.id), body);
      return send(201, body);
    }
    send(404, { message: 'not found' });
  });
  server.listen(3500);
  return server;
}
