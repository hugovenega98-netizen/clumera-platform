import { defineModule } from '@clumera/kernel';

/** Manifiesto de Escuelas. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'schools',
  name: 'Escuelas',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['schools:enroll', 'schools:enrollment.view', 'schools:manage', 'schools:attendance.mark'],
  routes: ['/api/m/schools', '/escuelas'],
  nav: [
    { id: 'schools', label: 'Escuelas', href: '/escuelas', space: 'member', permission: 'schools:enroll' },
  ],
  homeCards: [],
  emits: ['enrollment.confirmed', 'enrollment.withdrawn'],
  listens: ['payment.approved'],
});
