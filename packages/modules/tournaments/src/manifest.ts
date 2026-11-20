import { defineModule } from '@clumera/kernel';

/**
 * Manifiesto de Torneos: inscripción de equipos, sorteo en zonas, fixture todos contra todos,
 * resultados con las reglas del deporte, tabla calculada, eliminación directa y página pública.
 */
export const manifest = defineModule({
  id: 'tournaments',
  name: 'Torneos',
  version: '0.2.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['tournaments:register', 'tournaments:manage', 'tournaments:result.record'],
  routes: ['/api/m/tournaments', '/torneos', '/admin/torneos'],
  nav: [
    { id: 'tournaments', label: 'Torneos', href: '/torneos', space: 'member', permission: 'tournaments:register' },
    { id: 'manage', label: 'Torneos', href: '/admin/torneos', space: 'admin', permission: 'tournaments:manage' },
  ],
  homeCards: [],
  emits: ['tournament.team_registered', 'tournament.fixture_published', 'tournament.result_recorded'],
  listens: ['payment.approved'],
});
