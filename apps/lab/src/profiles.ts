/**
 * Perfiles del selector de Lab (plan: Socio, Superadmin, Coach, Médico/Kine, Contabilidad, Mesa,
 * Recepción, Encargado de instalaciones, Coordinador, Profesor, Organizador, Caja).
 * Las cuentas de perfil no tienen contraseña: solo se entra desde el selector.
 */
export interface LabProfile {
  key: string;
  label: string;
  description: string;
  login: string;
  firstName: string;
  lastName: string;
  roles: Array<{ role: string; scopeType: 'club' | 'sport' | 'team' | 'venue' | 'resource' | 'event' | 'activity'; scopeId?: string }>;
  membership?: 'activo' | 'cadete' | 'vitalicio';
}

export const LAB_PROFILES: LabProfile[] = [
  { key: 'socio', label: 'Socio', description: 'Socia activa con un hijo en el club', login: 'socio@lab.clumera.app', firstName: 'Ana', lastName: 'Fernández', roles: [], membership: 'activo' },
  { key: 'superadmin', label: 'Superadmin', description: 'Administra todo el club', login: 'admin@lab.clumera.app', firstName: 'Sofía', lastName: 'Ruiz', roles: [{ role: 'superadmin', scopeType: 'club' }], membership: 'vitalicio' },
  { key: 'coach', label: 'Coach', description: 'Entrenador de Rugby M19', login: 'coach@lab.clumera.app', firstName: 'Martín', lastName: 'Sosa', roles: [{ role: 'coach', scopeType: 'team', scopeId: 'rugby-m19' }], membership: 'activo' },
  { key: 'medico', label: 'Médico/Kine', description: 'Salud de los planteles de rugby', login: 'medico@lab.clumera.app', firstName: 'Laura', lastName: 'Paz', roles: [{ role: 'medical', scopeType: 'sport', scopeId: 'rugby' }] },
  { key: 'contabilidad', label: 'Contabilidad', description: 'Cobros, cajas y reportes', login: 'contabilidad@lab.clumera.app', firstName: 'Pablo', lastName: 'Ibarra', roles: [{ role: 'accounting', scopeType: 'club' }] },
  { key: 'mesa', label: 'Mesa', description: 'Mesa de control de partidos', login: 'mesa@lab.clumera.app', firstName: 'Lucas', lastName: 'Díaz', roles: [{ role: 'desk', scopeType: 'sport', scopeId: 'rugby' }] },
  { key: 'recepcion', label: 'Recepción', description: 'Valida accesos en la entrada', login: 'recepcion@lab.clumera.app', firstName: 'Rosa', lastName: 'Vega', roles: [{ role: 'reception', scopeType: 'club' }] },
  { key: 'instalaciones', label: 'Encargado de instalaciones', description: 'Canchas, pileta, salón y gimnasio', login: 'instalaciones@lab.clumera.app', firstName: 'Diego', lastName: 'Molina', roles: [{ role: 'facility_manager', scopeType: 'club' }] },
  { key: 'coordinador', label: 'Coordinador', description: 'Escuelas y colonia de verano', login: 'coordinador@lab.clumera.app', firstName: 'Carla', lastName: 'Benítez', roles: [{ role: 'coordinator', scopeType: 'club' }] },
  { key: 'profesor', label: 'Profesor', description: 'Escuela de natación', login: 'profesor@lab.clumera.app', firstName: 'Juan', lastName: 'Acosta', roles: [{ role: 'teacher', scopeType: 'activity', scopeId: 'natacion' }] },
  { key: 'organizador', label: 'Organizador', description: 'Torneos y eventos', login: 'organizador@lab.clumera.app', firstName: 'Vera', lastName: 'Luna', roles: [{ role: 'organizer', scopeType: 'club' }] },
  { key: 'caja', label: 'Caja', description: 'Cobros en mostrador y tienda', login: 'caja@lab.clumera.app', firstName: 'Nicolás', lastName: 'Rey', roles: [{ role: 'cashier', scopeType: 'club' }] },
];
