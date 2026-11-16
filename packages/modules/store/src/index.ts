import { defineModule } from '@clumera/kernel';

/** Manifiesto de Tienda. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'store',
  name: 'Tienda',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['store:buy', 'store:order.view', 'store:sell', 'store:catalog.manage', 'store:stock.manage'],
  routes: ['/api/m/store', '/tienda'],
  nav: [
    { id: 'store', label: 'Tienda', href: '/tienda', space: 'member', permission: 'store:buy' },
  ],
  homeCards: [],
  emits: ['order.placed', 'order.paid', 'stock.low'],
  listens: ['payment.approved', 'payment.refunded'],
});
