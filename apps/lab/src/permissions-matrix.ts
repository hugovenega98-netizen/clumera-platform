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
const padel2 = { type: 'venue', id: 'padel-2' } as const;

export const PERMISSION_CASES: PermissionCase[] = [
  { id: 'person-manage', label: 'Dar altas, crear cuentas y revocar carnets', action: 'identity:person.manage', allowed: ['superadmin'] },
  { id: 'role-assign', label: 'Asignar y quitar roles con su alcance', action: 'identity:role.assign', allowed: ['superadmin'] },
  { id: 'person-view', label: 'Ver el padrón y las fichas de personas', action: 'identity:person.view', allowed: ['superadmin', 'contabilidad', 'coordinador'] },
  // El carnet propio lo ve cualquiera con membresía activa (rol implícito de socio).
  { id: 'own-card', label: 'Ver su propio carnet', action: 'identity:card.view', resource: { scopes: [], owner: 'self' }, allowed: ['socio', 'superadmin', 'coach'] },
  { id: 'other-card', label: 'Ver el carnet de otra persona', action: 'identity:card.view', resource: { scopes: [], owner: 'other' }, allowed: ['superadmin'] },
  { id: 'own-account', label: 'Ver sus propios pagos', action: 'finance:account.view', resource: { scopes: [], owner: 'self' }, allowed: ['socio', 'superadmin', 'coach', 'contabilidad', 'caja'] },
  { id: 'other-account', label: 'Ver la deuda de otra persona', action: 'finance:account.view', resource: { scopes: [], owner: 'other' }, allowed: ['superadmin', 'contabilidad', 'caja'] },
  { id: 'payment-record', label: 'Registrar cobros (caja, transferencia, posnet)', action: 'finance:payment.record', allowed: ['superadmin', 'contabilidad', 'caja'] },
  { id: 'charge-issue', label: 'Emitir y anular cargos, cuotas del mes', action: 'finance:charge.issue', allowed: ['superadmin', 'contabilidad'] },
  { id: 'finance-report', label: 'Ver reportes y conciliación de Finanzas', action: 'finance:report.view', allowed: ['superadmin', 'contabilidad'] },
  // Clínico: ningún comodín lo concede, ni el de Superadmin (solo quien lo tiene asignado).
  { id: 'health', label: 'Ver datos de salud de rugby', action: 'sports:health.view', resource: { scopes: [rugby] }, allowed: ['medico'] },
  { id: 'health-hockey', label: 'Ver datos de salud de hockey', action: 'sports:health.view', resource: { scopes: [{ type: 'sport', id: 'hockey' }] }, allowed: [] },
  { id: 'sports-view-m19', label: 'Ver el minuto a minuto privado de Rugby M19 y seguir el partido', action: 'sports:view', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m19' }] }, allowed: ['superadmin', 'socio', 'coach', 'medico', 'mesa'] },
  // Transmisión, pases de invitado y planilla transitoria: quien arma la formación.
  { id: 'lineup-m19', label: 'Armar la formación de Rugby M19', action: 'sports:lineup.edit', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m19' }] }, allowed: ['superadmin', 'coach'] },
  { id: 'lineup-m17', label: 'Armar la formación de Rugby M17', action: 'sports:lineup.edit', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m17' }] }, allowed: ['superadmin'] },
  { id: 'match-control', label: 'Operar la mesa de control de rugby', action: 'sports:match.control', resource: { scopes: [rugby] }, allowed: ['superadmin', 'mesa'] },
  { id: 'match-control-hockey', label: 'Operar la mesa de control de hockey', action: 'sports:match.control', resource: { scopes: [{ type: 'sport', id: 'hockey' }, { type: 'team', id: 'hockey-damas' }] }, allowed: ['superadmin'] },
  { id: 'sports-manage', label: 'Administrar deportes, equipos y planteles', action: 'sports:manage', allowed: ['superadmin'] },
  { id: 'access', label: 'Validar accesos en la entrada', action: 'access:validate', allowed: ['superadmin', 'recepcion'] },
  { id: 'access-override', label: 'Autorizar una excepción de acceso (con motivo)', action: 'access:override', allowed: ['superadmin', 'recepcion'] },
  { id: 'access-log', label: 'Ver los últimos intentos del punto de acceso', action: 'access:log.view', allowed: ['superadmin', 'recepcion'] },
  { id: 'venues', label: 'Administrar instalaciones (espacios, reglas y tarifas)', action: 'facilities:venue.manage', resource: { scopes: [padel2] }, allowed: ['superadmin', 'instalaciones'] },
  { id: 'agenda', label: 'Ver la agenda central', action: 'facilities:venue.view', resource: { scopes: [padel2] }, allowed: ['superadmin', 'instalaciones'] },
  { id: 'blocks', label: 'Bloquear un espacio (mantenimiento)', action: 'facilities:block.manage', resource: { scopes: [padel2] }, allowed: ['superadmin', 'instalaciones'] },
  { id: 'book', label: 'Reservar un turno', action: 'bookings:book', allowed: ['superadmin', 'socio', 'coach'] },
  { id: 'bookings-manage', label: 'Ver y cancelar las reservas del día de otras personas', action: 'bookings:manage', resource: { scopes: [padel2] }, allowed: ['superadmin', 'instalaciones'] },
  { id: 'bookings-series', label: 'Cargar y cancelar reservas fijas (el mismo turno cada semana)', action: 'bookings:manage', resource: { scopes: [{ type: 'venue', id: 'padel-1' }] }, allowed: ['superadmin', 'instalaciones'] },
  { id: 'attendance', label: 'Tomar asistencia en natación', action: 'schools:attendance.mark', resource: { scopes: [{ type: 'activity', id: 'natacion' }] }, allowed: ['superadmin', 'profesor'] },
  { id: 'schools-enroll', label: 'Inscribirse (o a su familia) en una escuela', action: 'schools:enroll', allowed: ['superadmin', 'socio', 'coach'] },
  { id: 'camp-enroll', label: 'Inscribir a su familia en la colonia', action: 'summer:camp.enroll', allowed: ['superadmin', 'socio', 'coach'] },
  { id: 'camp-manage', label: 'Administrar la colonia (grupos, inscripciones, documentos)', action: 'summer:manage', allowed: ['superadmin', 'coordinador'] },
  { id: 'camp-health-doc', label: 'Abrir y revisar el apto físico de la colonia (dato de salud; ni Superadmin ni el médico de un deporte)', action: 'summer:document.sensitive.view', allowed: ['coordinador'] },
  { id: 'schools-manage', label: 'Administrar escuelas', action: 'schools:manage', allowed: ['superadmin', 'coordinador'] },
  { id: 'tournaments', label: 'Organizar torneos', action: 'tournaments:manage', allowed: ['superadmin', 'organizador'] },
  { id: 'sell', label: 'Vender en la tienda', action: 'store:sell', allowed: ['superadmin', 'caja'] },
  { id: 'cash', label: 'Operar la caja', action: 'finance:cash.operate', allowed: ['superadmin', 'contabilidad', 'caja'] },
  { id: 'send-m19', label: 'Mandar avisos al plantel de Rugby M19', action: 'notifications:send', resource: { scopes: [rugby, { type: 'team', id: 'rugby-m19' }] }, allowed: ['superadmin', 'coach', 'coordinador', 'organizador'] },
  // El coach tiene el rol acotado a su equipo: no puede avisar a todo el club.
  { id: 'send-club', label: 'Mandar avisos a todo el club', action: 'notifications:send', allowed: ['superadmin', 'coordinador', 'organizador'] },
];
