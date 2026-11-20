import { defineModule } from '@clumera/kernel';

/** Manifiesto de Instalaciones: espacios, estado físico, reglas, tarifas y bloqueos en la agenda central. */
export const manifest = defineModule({
  id: 'facilities',
  name: 'Instalaciones',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['facilities:venue.view', 'facilities:venue.manage', 'facilities:block.manage'],
  routes: ['/api/m/facilities', '/instalaciones'],
  nav: [
    { id: 'venues', label: 'Instalaciones', href: '/instalaciones', space: 'admin', permission: 'facilities:venue.view' },
  ],
  homeCards: [],
  emits: ['facility.blocked'],
  listens: [],
});
