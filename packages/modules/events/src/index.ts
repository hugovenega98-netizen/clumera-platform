import { defineModule } from '@clumera/kernel';

/** Manifiesto de Eventos. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'events',
  name: 'Eventos',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['events:ticket.buy', 'events:ticket.view', 'events:manage', 'events:checkin'],
  routes: ['/api/m/events', '/eventos'],
  nav: [
    { id: 'events', label: 'Eventos', href: '/eventos', space: 'member', permission: 'events:ticket.buy' },
  ],
  homeCards: [],
  emits: ['ticket.issued', 'event.closed'],
  listens: ['payment.approved', 'payment.refunded'],
});
