import { defineModule } from '@clumera/kernel';

/** Manifiesto de Verano. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'summer',
  name: 'Verano',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['summer:pass.buy', 'summer:pass.view', 'summer:camp.enroll', 'summer:manage'],
  routes: ['/api/m/summer', '/verano'],
  nav: [
    { id: 'summer', label: 'Verano', href: '/verano', space: 'member', permission: 'summer:pass.buy' },
  ],
  homeCards: [],
  emits: ['pool_pass.activated', 'camp.enrollment_confirmed'],
  listens: ['payment.approved'],
});
