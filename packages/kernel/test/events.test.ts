import { describe, expect, it } from 'vitest';
import { createEvent, EventBus } from '../src';

describe('eventos de dominio', () => {
  it('valida el nombre del evento', () => {
    expect(() => createEvent('Pago aprobado', 'finance', {})).toThrow();
    expect(createEvent('payment.approved', 'finance', { chargeId: 'c1' }).type).toBe('payment.approved');
  });

  it('entrega solo a quienes escuchan ese tipo', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.on('payment.approved', (e) => void seen.push(e.id));
    const off = bus.on('booking.confirmed', (e) => void seen.push(`b:${e.id}`));
    off();
    await bus.dispatch(createEvent('payment.approved', 'finance', {}, { id: 'e1' }));
    await bus.dispatch(createEvent('booking.confirmed', 'bookings', {}, { id: 'e2' }));
    expect(seen).toEqual(['e1']);
  });
});
