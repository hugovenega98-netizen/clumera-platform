import { defineModule } from '@clumera/kernel';

/**
 * Servicios del core expuestos como módulos `core`: siempre encendidos, pero con
 * permisos y rutas declarados igual que un módulo, para que `can()` y el proxy los traten igual.
 */
export const identity = defineModule({
  id: 'identity',
  name: 'Socios y personas',
  version: '0.1.0',
  kind: 'core',
  dependsOn: [],
  permissions: ['identity:person.view', 'identity:person.manage', 'identity:role.assign', 'identity:card.view', 'identity:family.manage'],
  routes: ['/api/identity'],
  nav: [
    { id: 'card', label: 'Carnet', href: '/carnet', space: 'member', permission: 'identity:card.view' },
    { id: 'family', label: 'Familia', href: '/familia', space: 'member', permission: 'identity:family.manage' },
    { id: 'people', label: 'Socios y personas', href: '/admin/personas', space: 'admin', permission: 'identity:person.view' },
  ],
  homeCards: [{ id: 'card', title: 'Mi carnet', space: 'member', permission: 'identity:card.view' }],
  emits: ['person.created', 'membership.status_changed', 'role.assigned', 'role.revoked'],
  listens: [],
});

export const finance = defineModule({
  id: 'finance',
  name: 'Finanzas',
  version: '0.1.0',
  kind: 'core',
  dependsOn: ['identity'],
  permissions: ['finance:account.view', 'finance:charge.issue', 'finance:payment.record', 'finance:refund.issue', 'finance:report.view', 'finance:cash.operate'],
  routes: ['/api/finance', '/api/webhooks/mercadopago'],
  nav: [
    { id: 'payments', label: 'Pagos', href: '/pagos', space: 'member', permission: 'finance:account.view' },
    { id: 'accounting', label: 'Contabilidad', href: '/admin/finanzas', space: 'admin', permission: 'finance:report.view' },
  ],
  homeCards: [{ id: 'balance', title: 'Mis pagos', space: 'member', permission: 'finance:account.view' }],
  emits: ['charge.issued', 'payment.approved', 'payment.rejected', 'payment.refunded'],
  listens: [],
});

export const notifications = defineModule({
  id: 'notifications',
  name: 'Avisos',
  version: '0.1.0',
  kind: 'core',
  dependsOn: ['identity'],
  permissions: ['notifications:inbox.view', 'notifications:send', 'notifications:subscribe'],
  routes: ['/api/notifications', '/api/push'],
  nav: [{ id: 'inbox', label: 'Avisos', href: '/avisos', space: 'member', permission: 'notifications:inbox.view' }],
  homeCards: [],
  emits: [],
  listens: ['*'],
});

export const sports = defineModule({
  id: 'sports',
  name: 'Deportes',
  version: '0.1.0',
  kind: 'core',
  dependsOn: ['identity'],
  permissions: ['sports:view', 'sports:lineup.edit', 'sports:attendance.mark', 'sports:match.control', 'sports:health.view', 'sports:manage'],
  routes: ['/api/sports', '/deportes'],
  nav: [
    { id: 'my-sports', label: 'Mis deportes', href: '/deportes', space: 'sports', permission: 'sports:view' },
    { id: 'desk', label: 'Mesa de control', href: '/deportes/mesa', space: 'operations', permission: 'sports:match.control' },
  ],
  homeCards: [{ id: 'next-match', title: 'Próximo partido', space: 'sports', permission: 'sports:view' }],
  emits: ['match.started', 'match.finished'],
  listens: [],
});

export const coreManifests = [identity, finance, notifications, sports];
