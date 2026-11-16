import { defineModule } from '@clumera/kernel';

/** Manifiesto de Instalaciones. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'facilities',
  name: 'Instalaciones',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['facilities:venue.view', 'facilities:venue.manage', 'facilities:block.manage'],
  routes: ['/api/m/facilities', '/instalaciones'],
  nav: [
    { id: 'venues', label: 'Instalaciones', href: '/instalaciones', space: 'facilities', permission: 'facilities:venue.view' },
  ],
  homeCards: [],
  emits: ['facility.blocked'],
  listens: [],
});
