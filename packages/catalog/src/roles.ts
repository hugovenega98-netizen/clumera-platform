import type { RoleCatalog } from '@clumera/kernel';

/**
 * Roles base de una instalación. Cada asignación los acota con un ámbito (club, deporte,
 * equipo, espacio, evento o actividad). Recepción ve validez del acceso, nunca deuda ni salud;
 * solo Médico/Kine tiene `sports:health.view`.
 */
export const baseRoles = {
  superadmin: ['*'],
  member: [
    'identity:card.view:self',
    'identity:family.manage:self',
    'finance:account.view:self',
    'notifications:inbox.view',
    'notifications:subscribe',
    'sports:view',
    'bookings:book',
    'bookings:book.view:self',
    'schools:enroll',
    'schools:enrollment.view:self',
    'summer:pass.buy',
    'summer:pass.view:self',
    'summer:camp.enroll',
    'events:ticket.buy',
    'events:ticket.view:self',
    'store:buy',
    'store:order.view:self',
  ],
  coach: ['sports:view', 'sports:lineup.edit', 'sports:attendance.mark', 'notifications:send'],
  medical: ['sports:view', 'sports:health.view'],
  accounting: ['finance:*', 'identity:person.view'],
  desk: ['sports:view', 'sports:match.control'],
  reception: ['access:validate'],
  facility_manager: ['facilities:*', 'bookings:manage', 'bookings:tariff.manage'],
  coordinator: ['schools:manage', 'summer:manage', 'identity:person.view', 'notifications:send'],
  teacher: ['schools:attendance.mark'],
  organizer: ['tournaments:*', 'events:*', 'notifications:send'],
  cashier: ['finance:cash.operate', 'finance:payment.record', 'store:sell'],
} as const satisfies RoleCatalog;

export type BaseRole = keyof typeof baseRoles;

export const roleNames: Record<BaseRole, string> = {
  superadmin: 'Superadmin',
  member: 'Socio',
  coach: 'Coach',
  medical: 'Médico/Kine',
  accounting: 'Contabilidad',
  desk: 'Mesa de control',
  reception: 'Recepción',
  facility_manager: 'Encargado de instalaciones',
  coordinator: 'Coordinador',
  teacher: 'Profesor',
  organizer: 'Organizador de torneos y eventos',
  cashier: 'Caja',
};
