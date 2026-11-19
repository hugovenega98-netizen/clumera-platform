import 'server-only';
import { isGuardianOf } from '@clumera/identity';
import { scopesOf } from '@clumera/sports';
import type { NextResponse } from 'next/server';
import { permissionChecker } from './authz';
import { getPrisma } from './db';
import { errorResponse } from './http';
import { getCurrentSession } from './session';
import type { SessionInfo } from '@clumera/identity';

type Team = { slug: string; sport: { slug: string } };

/** Qué puede hacer una persona con un equipo: ver, dirigir (coach), operar la mesa, administrar. */
export async function teamAccess(personId: string, team: Team) {
  const can = await permissionChecker(personId);
  const resource = { scopes: scopesOf(team) };
  return {
    view: can('sports:view', resource),
    coach: can('sports:lineup.edit', resource),
    desk: can('sports:match.control', resource),
    manage: can('sports:manage'),
  };
}

/** La persona misma o su responsable. */
export async function actsFor(viewerId: string, personId: string): Promise<boolean> {
  return isGuardianOf(getPrisma(), viewerId, personId);
}

/** Sesión + acceso a un partido para la API (401/403/404). */
export async function guardMatch(
  matchId: string,
  need: 'coach' | 'desk' | 'coachOrDesk' | 'view',
): Promise<{ ok: true; session: SessionInfo; match: { id: string; teamId: string; status: string; team: Team & { id: string } } } | { ok: false; response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  const match = await getPrisma().match.findUnique({ where: { id: matchId }, select: { id: true, teamId: true, status: true, team: { select: { id: true, slug: true, sport: { select: { slug: true } } } } } });
  if (!match) return { ok: false, response: errorResponse('not_found', 'Partido inexistente', 404) };
  const a = await teamAccess(session.personId, match.team);
  const allowed = need === 'coach' ? a.coach : need === 'desk' ? a.desk : need === 'coachOrDesk' ? a.coach || a.desk : a.view;
  if (!allowed) return { ok: false, response: errorResponse('forbidden', 'No tenés permiso sobre este partido', 403) };
  return { ok: true, session, match };
}

/** Equipos que la persona dirige y que puede operar en la mesa (según sus roles y ámbitos). */
export async function staffTeams(personId: string) {
  const can = await permissionChecker(personId);
  const teams = await getPrisma().team.findMany({ where: { active: true, sport: { active: true } }, include: { sport: true }, orderBy: [{ sport: { name: 'asc' } }, { name: 'asc' }] });
  const withScopes = teams.map((t) => ({ team: t, resource: { scopes: scopesOf(t) } }));
  return {
    coach: withScopes.filter((x) => can('sports:lineup.edit', x.resource)).map((x) => x.team),
    desk: withScopes.filter((x) => can('sports:match.control', x.resource)).map((x) => x.team),
  };
}

/**
 * Equipos sobre los que la persona ve datos clínicos: `sports:health.view` en el ámbito del deporte
 * o del equipo. Es una acción explícita: ningún comodín (ni Superadmin) la concede.
 */
export async function healthTeams(personId: string) {
  const can = await permissionChecker(personId);
  const teams = await getPrisma().team.findMany({ where: { sport: { active: true } }, include: { sport: true }, orderBy: [{ sport: { name: 'asc' } }, { name: 'asc' }] });
  return teams.filter((t) => can('sports:health.view', { scopes: scopesOf(t) }));
}

/** Sesión + acceso clínico al reporte (401/403/404). */
export async function healthAccessToReport(reportId: string): Promise<{ ok: true; session: SessionInfo; reportId: string } | { ok: false; response: NextResponse }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: errorResponse('unauthenticated', 'Ingresá para continuar', 401) };
  const r = await getPrisma().injuryReport.findUnique({ where: { id: reportId }, select: { id: true, team: { select: { slug: true, sport: { select: { slug: true } } } } } });
  if (!r) return { ok: false, response: errorResponse('not_found', 'Reporte inexistente', 404) };
  const can = await permissionChecker(session.personId);
  if (!can('sports:health.view', { scopes: scopesOf(r.team) })) return { ok: false, response: errorResponse('forbidden', 'Los datos de salud son solo para Médico/Kine', 403) };
  return { ok: true, session, reportId: r.id };
}
