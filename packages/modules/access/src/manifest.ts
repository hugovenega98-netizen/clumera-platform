import { defineModule } from '@clumera/kernel';

/**
 * Manifiesto de Accesos: Recepción valida carnets, pases y credenciales de reservas en un punto de
 * acceso; cada intento queda registrado y una excepción exige motivo.
 */
export const manifest = defineModule({
  id: 'access',
  name: 'Accesos',
  version: '0.2.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['access:validate', 'access:override', 'access:point.manage', 'access:log.view'],
  routes: ['/api/m/access', '/recepcion'],
  nav: [
    { id: 'reception', label: 'Recepción', href: '/recepcion', space: 'operations', permission: 'access:validate' },
    // En el menú de áreas (escritorio y «Más»), para Recepción y Superadmin.
    { id: 'reception-admin', label: 'Recepción', href: '/recepcion', space: 'admin', permission: 'access:validate' },
  ],
  homeCards: [],
  emits: ['access.granted', 'access.denied'],
  listens: ['credential.revoked'],
});
