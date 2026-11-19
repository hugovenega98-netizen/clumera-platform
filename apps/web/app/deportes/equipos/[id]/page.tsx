import { absencesOf, performance, roster, teamMatches, teamWithSport } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden, notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { AbsenceForm, CancelAbsence, NewMatchForm } from '@/components/SportsForms';
import { getPrisma } from '@/lib/db';
import { dateFmt } from '@/lib/people-format';
import { requireSession } from '@/lib/session';
import { actsFor, teamAccess } from '@/lib/sports-access';

export const metadata: Metadata = { title: 'Equipo' };
export const dynamic = 'force-dynamic';

const AVAILABILITY_TONE: Record<string, string> = { absent: 'cx-tag--bad', unavailable: 'cx-tag--bad', restricted: 'cx-tag--warn', under_review: 'cx-tag--info', no_restrictions: 'cx-tag--ok' };

const when = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
const STATUS: Record<string, string> = { scheduled: 'Programado', live: 'En juego', pending_close: 'Final (a confirmar)', played: 'Jugado', cancelled: 'Suspendido' };
const RESP: Record<string, { label: string; tone: string }> = { going: { label: 'Voy', tone: 'cx-tag--ok' }, not_going: { label: 'No voy', tone: 'cx-tag--bad' }, pending: { label: 'Sin responder', tone: 'cx-tag--warn' } };

/** Un equipo desde la mirada de quien juega (o su responsable) y, para el coach, el plantel. */
export default async function TeamPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ persona?: string; vista?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession(`/deportes/equipos/${id}`);
  const db = getPrisma();
  const team = await teamWithSport(db, id);
  if (!team) notFound();
  const access = await teamAccess(session.personId, team);
  const personId = sp.persona ?? session.personId;
  const membership = await db.teamMember.findUnique({ where: { teamId_personId: { teamId: id, personId } } });
  const own = Boolean(membership?.active) && (await actsFor(session.personId, personId));
  if (!own && !access.view && !access.coach) forbidden();
  const person = own ? await db.person.findUniqueOrThrow({ where: { id: personId }, select: { firstName: true } }) : null;

  const tabs = [
    { key: 'partidos', label: 'Partidos', show: true },
    { key: 'disponibilidad', label: 'Disponibilidad', show: own },
    { key: 'rendimiento', label: 'Rendimiento', show: own },
    { key: 'plantel', label: 'Plantel', show: access.coach },
  ].filter((t) => t.show);
  const view = tabs.find((t) => t.key === sp.vista)?.key ?? 'partidos';
  const q = (v: string) => `/deportes/equipos/${id}?${new URLSearchParams({ ...(sp.persona ? { persona: sp.persona } : {}), vista: v })}`;

  const matches = view === 'partidos' ? await teamMatches(db, id, own ? personId : undefined) : [];
  const perf = view === 'rendimiento' && own ? await performance(db, personId, id) : null;
  const absences = view === 'disponibilidad' && own ? (await absencesOf(db, [personId], new Date(Date.now() - 86_400_000))).filter((a) => a.teamId === id) : [];
  const next = view === 'plantel' ? await db.match.findFirst({ where: { teamId: id, status: 'scheduled' }, orderBy: { startsAt: 'asc' } }) : null;
  const players = view === 'plantel' ? await roster(db, id, next?.startsAt ?? new Date()) : [];

  return (
    <AppShell session={session} current="/deportes" title={team.sport.name}>
      <nav aria-label="Ruta">
        <Link className="cx-link" href="/deportes">
          ← Mis deportes
        </Link>
      </nav>
      <header>
        <h1>
          {team.sport.name} · {team.name}
        </h1>
        {person && personId !== session.personId ? <p className="cx-muted">Mirando como responsable de {person.firstName}.</p> : null}
      </header>
      <nav className="profile-tabs" aria-label="Secciones del equipo">
        {tabs.map((t) => (
          <Link key={t.key} href={q(t.key)} aria-current={t.key === view ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {view === 'partidos' ? (
        <Card title="Partidos">
          {matches.length === 0 ? <p className="cx-muted">Sin partidos.</p> : null}
          <div className="rows">
            {matches.map((m) => {
              const c = 'callups' in m ? (m.callups as Array<{ response: string; inLineup: boolean }>)[0] : undefined;
              const played = m.status === 'played' || m.status === 'pending_close';
              return (
                <div key={m.id}>
                  <span className="grow">
                    <Link className="cx-link" href={access.coach || access.desk ? `/deportes/partidos/${m.id}` : `/vivo/${m.id}`}>
                      {m.home ? 'vs.' : 'en'} {m.opponent}
                    </Link>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {when.format(m.startsAt)}
                      {m.venue ? ` · ${m.venue}` : ''} · {STATUS[m.status]}
                    </span>
                  </span>
                  {played && m.scoreFor != null ? (
                    <strong className={m.scoreFor > (m.scoreAgainst ?? 0) ? 'cx-tag cx-tag--ok' : m.scoreFor < (m.scoreAgainst ?? 0) ? 'cx-tag cx-tag--bad' : 'cx-tag'}>
                      {m.scoreFor} – {m.scoreAgainst}
                    </strong>
                  ) : null}
                  {c && m.status === 'scheduled' ? <span className={`cx-tag ${RESP[c.response]!.tone}`}>{RESP[c.response]!.label}</span> : null}
                  {m.status === 'live' ? (
                    <Link className="cx-tag cx-tag--bad" href={`/vivo/${m.id}`}>
                      ● En vivo
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {view === 'disponibilidad' && own ? (
        <div className="cx-columns">
          <Card title="Avisar una ausencia">
            <AbsenceForm personId={personId} teamId={id} />
          </Card>
          <Card title="Ausencias avisadas">
            {absences.length === 0 ? <p className="cx-muted">No hay ausencias próximas.</p> : null}
            <div className="rows">
              {absences.map((a) => (
                <div key={a.id}>
                  <span className="grow">
                    <strong>{dateFmt.format(a.date)}</strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {a.reason}
                    </span>
                  </span>
                  <CancelAbsence absenceId={a.id} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {view === 'rendimiento' && perf ? (
        <Card title="Rendimiento en el equipo">
          <section className="stat-row" aria-label="Resumen">
            <div>
              <b>{perf.matches}</b>
              <span className="cx-muted">Partidos</span>
            </div>
            <div>
              <b>{perf.points}</b>
              <span className="cx-muted">Puntos</span>
            </div>
            <div>
              <b>{perf.attendance == null ? '—' : `${perf.attendance}%`}</b>
              <span className="cx-muted">Asistencia</span>
            </div>
          </section>
          {perf.events.length ? (
            <div className="rows">
              {perf.events.map((e) => (
                <div key={e.type}>
                  <span className="grow">{e.label}</span>
                  <strong>{e.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="cx-muted">Todavía sin incidencias registradas.</p>
          )}
        </Card>
      ) : null}

      {view === 'plantel' && access.coach ? (
        <div className="cx-columns">
          <Card title={next ? `Plantel · disponibilidad para ${when.format(next.startsAt)}` : 'Plantel'}>
            <div className="rows">
              {players.map((p) => (
                <div key={p.personId}>
                  <span className="grow">
                    {p.lastName}, {p.firstName}
                    {p.number != null ? <span className="cx-muted"> · N° {p.number}</span> : null}
                    {p.absenceReason ? (
                      <span className="cx-muted" style={{ display: 'block' }}>
                        {p.absenceReason}
                      </span>
                    ) : null}
                  </span>
                  <span className={`cx-tag ${AVAILABILITY_TONE[p.availability.code] ?? ''}`}>{p.availability.label}</span>
                </div>
              ))}
            </div>
            <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
              La disponibilidad por salud la informa Médico/Kine; acá nunca se ven diagnósticos ni notas.
            </p>
          </Card>
          <Card title="Nuevo partido">
            <NewMatchForm teamId={id} />
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}
