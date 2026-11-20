import { defineModule } from '@clumera/kernel';

/**
 * Manifiesto de Escuelas: propuestas con grupos, cupo y lista de espera; la familia inscribe,
 * la cuota va a la cuenta (Finanzas) y el profesor toma asistencia.
 */
export const manifest = defineModule({
  id: 'schools',
  name: 'Escuelas',
  version: '0.2.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['schools:enroll', 'schools:enrollment.view', 'schools:manage', 'schools:attendance.mark'],
  routes: ['/api/m/schools', '/escuelas', '/admin/escuelas'],
  nav: [
    { id: 'schools', label: 'Actividades', href: '/escuelas', space: 'member', permission: 'schools:enroll' },
    { id: 'attendance', label: 'Mis grupos', href: '/escuelas/asistencia', space: 'operations', permission: 'schools:attendance.mark' },
    // En el menú de áreas (escritorio y «Más»): el profesor entra a sus grupos; la coordinación, a Escuelas.
    { id: 'attendance-admin', label: 'Mis grupos', href: '/escuelas/asistencia', space: 'admin', permission: 'schools:attendance.mark' },
    { id: 'manage', label: 'Escuelas', href: '/admin/escuelas', space: 'admin', permission: 'schools:manage' },
  ],
  homeCards: [],
  emits: ['enrollment.confirmed', 'enrollment.pending', 'enrollment.waitlisted', 'enrollment.promoted', 'enrollment.withdrawn'],
  listens: ['payment.approved'],
});
