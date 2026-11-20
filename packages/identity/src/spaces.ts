/**
 * Espacios: una cuenta, varias participaciones. Cada rol asignado abre un espacio (coach de un equipo,
 * encargado de instalaciones, contabilidad…) además de «Mi club». Cambiar de espacio no cambia la
 * identidad ni los permisos: solo qué se muestra primero.
 */
import type { PrismaClient } from '@clumera/db';
import type { Actor } from '@clumera/kernel';

export interface Space {
  /** Valor guardado en la sesión: `member` o `<rol>:<tipo de ámbito>:<id>`. */
  key: string;
  label: string;
  detail: string;
  role: string;
  /** Pantalla de inicio del espacio. */
  home: string;
}

const ROLE_SPACE: Record<string, { label: string; home: string }> = {
  superadmin: { label: 'Administración', home: '/admin' },
  coach: { label: 'Panel Coach', home: '/deportes' },
  medical: { label: 'Salud', home: '/' },
  accounting: { label: 'Contabilidad', home: '/admin' },
  desk: { label: 'Mesa de control', home: '/deportes/mesa' },
  reception: { label: 'Recepción', home: '/recepcion' },
  facility_manager: { label: 'Instalaciones', home: '/instalaciones' },
  coordinator: { label: 'Coordinación', home: '/admin' },
  teacher: { label: 'Profesor', home: '/escuelas/asistencia' },
  organizer: { label: 'Torneos y eventos', home: '/' },
  cashier: { label: 'Caja', home: '/admin/finanzas' },
};

const SCOPE_WORD: Record<string, string> = { club: 'Todo el club', sport: 'Deporte', team: 'Equipo', venue: 'Espacio', resource: 'Recurso', event: 'Evento', activity: 'Actividad' };

export async function spacesFor(db: PrismaClient, actor: Actor): Promise<Space[]> {
  const membership = actor.assignments.find((a) => a.role === 'member');
  const roles = await db.role.findMany({ where: { code: { in: actor.assignments.map((a) => a.role) } }, select: { code: true, name: true } });
  const roleName = new Map(roles.map((r) => [r.code, r.name]));
  const spaces: Space[] = [];
  if (membership) spaces.push({ key: 'member', label: 'Mi club', detail: 'Socio', role: 'member', home: '/' });
  for (const a of actor.assignments) {
    if (a.role === 'member') continue;
    const base = ROLE_SPACE[a.role] ?? { label: roleName.get(a.role) ?? a.role, home: '/' };
    const scope = a.scope.type === 'club' ? SCOPE_WORD.club! : `${SCOPE_WORD[a.scope.type] ?? a.scope.type} ${a.scope.id}`;
    spaces.push({ key: `${a.role}:${a.scope.type}:${a.scope.id ?? ''}`, label: base.label, detail: `${roleName.get(a.role) ?? a.role} · ${scope}`, role: a.role, home: base.home });
  }
  return spaces;
}
