import { defineModule } from '@clumera/kernel';

/**
 * Manifiesto de Verano: colonia con grupos por edad y turno, documentación obligatoria, retiro
 * autorizado y pago; la confirmación llega con documentos aprobados y pago acreditado.
 * (Pases de pileta: siguiente tramo.)
 */
export const manifest = defineModule({
  id: 'summer',
  name: 'Verano',
  version: '0.2.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['summer:pass.buy', 'summer:pass.view', 'summer:camp.enroll', 'summer:manage', 'summer:document.sensitive.view'],
  routes: ['/api/m/summer', '/verano', '/admin/verano'],
  nav: [
    { id: 'summer', label: 'Colonia de verano', href: '/verano', space: 'member', permission: 'summer:camp.enroll' },
    { id: 'manage', label: 'Colonia', href: '/admin/verano', space: 'admin', permission: 'summer:manage' },
  ],
  homeCards: [],
  emits: ['pool_pass.activated', 'enrollment.confirmed', 'enrollment.pending', 'enrollment.waitlisted', 'enrollment.promoted', 'enrollment.withdrawn'],
  listens: ['payment.approved'],
});
