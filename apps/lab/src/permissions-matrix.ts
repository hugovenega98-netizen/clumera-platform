/**
 * Matriz de permisos de Lab: los perfiles de Lab son la capa de usuarios con la que se prueban
 * los permisos. Cada caso dice qué perfiles PUEDEN hacer la acción; todos los demás deben quedar
 * denegados. Se verifica contra la base sembrada (pruebas de integración), se muestra en
 * /lab/permisos y se recorre en e2e por rol.
 *
 * Regla: cada permiso o ruta protegida nueva agrega acá su caso, con autorizados y denegados.
 */
import type { Resource } from '@clumera/kernel';
import type { LAB_PROFILES } from './profiles';

export type ProfileKey = (typeof LAB_PROFILES)[number]['key'];

export interface PermissionCase {
  id: string;
  label: string;
  action: string;
  /** Recurso sobre el que se actúa. `owner: 'self'` = el propio perfil es el dueño. */
  resource?: Omit<Resource, 'ownerPersonIds'> & { owner?: 'self' | 'other' };
  allowed: ProfileKey[];
}

const rugby = { type: 'sport', id: 'rugby' } as const;

export const PERMISSION_CASES: PermissionCase[] = [
  { id: 'person-manage', label: 'Crear cuentas y editar personas', action: 'identity:person.manage', allowed: ['superadmin'] },
  { id: 'person-view', label: 'Ver fichas de personas', action: 'identity:person.view', allowed: ['superadmin', 'contabilidad', 'coordinador'] },
  // El carnet propio lo ve cualquiera con membresía activa (rol implícito de socio).
  { id: 'own-card', label: 'Ver su propio carnet', action: 'identity:card.view', resource: { scopes: [], owner: 'self' }, allowed: ['socio', 'superadmin', 'coach'] },
  { id: 'other-card', label: 'Ver el carnet de otra persona', action: 'identity:card.view', resource: { scopes: [], owner: 'other' }, allowed: ['superadmin'] },
  { id: 'own-account', label: 'Ver sus propios pagos', action: 'finance:account.view', resource: { scopes: [], owner: 'self' }, allowed: ['socio', 'superadmin', 'coach', 'contabilidad'] },
  { id: 'other-account', label: 'Ver la deuda de otra persona', action: 'finance:account.view', resource: { scopes: [], owner: 'other' }, allowed: ['superadmin', 'contabilidad'] },
  { id: 'health', label: 'Ver datos de salud de rugby', action: 'sports:health.view', resource: { scopes: [rugby] }, allowed: ['superadmin', 'medico'] },
  { id: 'lineup-m19', label: 'Armar la formación de Rugby M19', action: 'sports:lineup.edit', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m19' }] }, allowed: ['superadmin', 'coach'] },
  { id: 'lineup-m17', label: 'Armar la formación de Rugby M17', action: 'sports:lineup.edit', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m17' }] }, allowed: ['superadmin'] },
  { id: 'match-control', label: 'Operar la mesa de control de rugby', action: 'sports:match.control', resource: { scopes: [rugby] }, allowed: ['superadmin', 'mesa'] },
  { id: 'access', label: 'Validar accesos en la entrada', action: 'access:validate', allowed: ['superadmin', 'recepcion'] },
  { id: 'venues', label: 'Administrar instalaciones', action: 'facilities:venue.manage', allowed: ['superadmin', 'instalaciones'] },
  { id: 'attendance', label: 'Tomar asistencia en natación', action: 'schools:attendance.mark', resource: { scopes: [{ type: 'activity', id: 'natacion' }] }, allowed: ['superadmin', 'profesor'] },
  { id: 'schools-manage', label: 'Administrar escuelas', action: 'schools:manage', allowed: ['superadmin', 'coordinador'] },
  { id: 'tournaments', label: 'Organizar torneos', action: 'tournaments:manage', allowed: ['superadmin', 'organizador'] },
  { id: 'sell', label: 'Vender en la tienda', action: 'store:sell', allowed: ['superadmin', 'caja'] },
  { id: 'cash', label: 'Operar la caja', action: 'finance:cash.operate', allowed: ['superadmin', 'contabilidad', 'caja'] },
  { id: 'send-m19', label: 'Mandar avisos al plantel de Rugby M19', action: 'notifications:send', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m19' }] }, allowed: ['superadmin', 'coach', 'coordinador', 'organizador'] },
  // El coach tiene el rol acotado a su equipo: no puede avisar a todo el club.
  { id: 'send-club', label: 'Mandar avisos a todo el club', action: 'notifications:send', allowed: ['superadmin', 'coordinador', 'organizador'] },
];
