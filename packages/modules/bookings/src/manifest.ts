import { defineModule } from '@clumera/kernel';

/** Manifiesto de Reservas: turnero de socios con seña, cancelación y liberación automática. */
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
    { id: 'manage', label: 'Reservas del día', href: '/reservas/gestion', space: 'admin', permission: 'bookings:manage' },
  ],
  homeCards: [],
  emits: ['booking.held', 'booking.confirmed', 'booking.cancelled', 'booking.released', 'booking.conflict'],
  listens: ['payment.approved', 'payment.refunded'],
});
