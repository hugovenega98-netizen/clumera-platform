import { defineModule } from '@clumera/kernel';

/** Manifiesto de Reservas. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'bookings',
  name: 'Reservas',
  version: '0.1.0',
  kind: 'module',
  dependsOn: ['facilities'],
  permissions: ['bookings:book', 'bookings:book.view', 'bookings:manage', 'bookings:tariff.manage'],
  routes: ['/api/m/bookings', '/reservas'],
  nav: [
    { id: 'book', label: 'Reservar', href: '/reservas', space: 'member', permission: 'bookings:book' },
    { id: 'manage', label: 'Turnos', href: '/reservas/gestion', space: 'facilities', permission: 'bookings:manage' },
  ],
  homeCards: [],
  emits: ['booking.held', 'booking.confirmed', 'booking.cancelled', 'booking.released'],
  listens: ['payment.approved', 'payment.refunded'],
});
