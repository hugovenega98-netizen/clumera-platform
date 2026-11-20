import { clubToday, roster, teacherGroups, WEEKDAYS } from '@clumera/module-schools';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AttendanceSheet } from '@/components/SchoolForms';
import { permissionChecker } from '@/lib/authz';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { activityScopes } from '@/lib/schools-access';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Mis grupos' };
export const dynamic = 'force-dynamic';

/**
 * Profesor (lienzo «Profesor · asistencia del grupo»): sus grupos —los de las actividades de su
 * rol— y la asistencia de hoy. Solo nombres: sin contacto, deuda ni salud.
 */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ grupo?: string }> }) {
  await requireModulePage('schools');
  const session = await requireSession('/escuelas/asistencia');
  const can = await permissionChecker(session.personId);
  const db = getPrisma();
  const groups = (await teacherGroups(db, null)).filter((g) => can('schools:attendance.mark', { scopes: activityScopes(g.program.activity) }));
  if (!groups.length && !can('schools:attendance.mark')) forbidden();
  const q = await searchParams;
  const group = groups.find((g) => g.id === q.grupo) ?? groups[0];
  const today = clubToday();
  const list = group ? await roster(db, group.id, today.day) : null;
  const classToday = group ? Boolean(group.days & (1 << today.weekday)) : false;
  return (
    <AppShell session={session} current="/escuelas/asistencia" title="Mis grupos" space="admin">
      <header className="agenda-bar">
        <div>
          <span className="reception__kicker">Mis grupos · asistencia</span>
          <h1>{group ? `${group.program.name} · ${group.name}` : 'Mis grupos'}</h1>
        </div>
      </header>
      {groups.length > 1 ? (
        <div className="chip-row" role="group" aria-label="Grupo">
          {groups.map((g) => (
            <Link key={g.id} className="chip chip--small" href={`/escuelas/asistencia?grupo=${g.id}`} aria-pressed={g.id === group?.id}>
              {g.program.name} · {g.name}
            </Link>
          ))}
        </div>
      ) : null}
      {!group || !list ? (
        <p className="cx-muted">Todavía no tenés grupos asignados.</p>
      ) : (
        <Card aria-label={`Asistencia de ${group.name}`}>
          <p className="cx-muted">
            {WEEKDAYS[today.weekday]} {today.day.slice(8)}/{today.day.slice(5, 7)} · {group.schedule}
            {group.place ? ` · ${group.place}` : ''} · {list.people.length} {list.people.length === 1 ? 'inscripto' : 'inscriptos'}
            {list.waiting ? ` · ${list.waiting} en lista de espera` : ''}
          </p>
          {!classToday ? <p className="callup-status callup-status--warn">Hoy no es día de clase de este grupo: la asistencia queda registrada igual para hoy.</p> : null}
          <AttendanceSheet key={`${group.id}:${today.day}`} groupId={group.id} day={today.day} people={list.people} saved={list.saved} />
        </Card>
      )}
    </AppShell>
  );
}
