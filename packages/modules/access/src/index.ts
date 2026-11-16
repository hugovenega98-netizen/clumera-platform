import { defineModule } from '@clumera/kernel';

/** Manifiesto de Accesos. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'access',
  name: 'Accesos',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['access:validate', 'access:point.manage', 'access:log.view'],
  routes: ['/api/m/access', '/recepcion'],
  nav: [
    { id: 'reception', label: 'Recepción', href: '/recepcion', space: 'operations', permission: 'access:validate' },
  ],
  homeCards: [],
  emits: ['access.granted', 'access.denied'],
  listens: ['credential.revoked'],
});
