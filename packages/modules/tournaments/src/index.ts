import { defineModule } from '@clumera/kernel';

/** Manifiesto de Torneos. Solo declara; la lógica llega en su hito. */
export const manifest = defineModule({
  id: 'tournaments',
  name: 'Torneos',
  version: '0.1.0',
  kind: 'module',
  dependsOn: [],
  permissions: ['tournaments:register', 'tournaments:manage', 'tournaments:result.record'],
  routes: ['/api/m/tournaments', '/torneos'],
  nav: [
    { id: 'tournaments', label: 'Torneos', href: '/torneos', space: 'operations', permission: 'tournaments:manage' },
  ],
  homeCards: [],
  emits: ['tournament.team_registered', 'tournament.fixture_published', 'tournament.result_recorded'],
  listens: ['payment.approved'],
});
