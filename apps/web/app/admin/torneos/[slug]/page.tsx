import { formatMoney } from '@clumera/finance';
import { STATUS_LABEL, tournamentView } from '@clumera/module-tournaments';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { ResultForm, TournamentAction } from '@/components/TournamentForms';
import { Bracket, GroupFixture, playDayLabel, ZoneTables } from '@/components/TournamentViews';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Torneo' };
export const dynamic = 'force-dynamic';

const TEAM_STATUS: Record<string, { label: string; tone: string }> = { registered: { label: 'Inscripción impaga', tone: 'cx-tag--warn' }, confirmed: { label: 'Confirmado', tone: 'cx-tag--ok' } };

/**
 * Torneo para Organización (lienzo «Torneos · fixture y tabla»): equipos e inscripciones, sorteo,
 * fixture con carga y corrección de resultados, tabla calculada y eliminación hasta el campeón.
 */
export default async function TournamentAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireModulePage('tournaments');
  const { slug } = await params;
  const { session, can } = await requireAdmin(`/admin/torneos/${slug}`, 'tournaments:manage');
  const db = getPrisma();
  const view = await tournamentView(db, slug);
  if (!view) notFound();
  const t = view.tournament;
  const record = can('tournaments:result.record');
  const group = view.matches.filter((m) => m.stage === 'group');
  const groupDone = group.length > 0 && group.every((m) => m.status === 'played');
  const charges = await db.tournamentTeam.findMany({ where: { tournamentId: t.id, status: { not: 'withdrawn' } }, select: { id: true, chargeId: true } });
  const action = record ? (m: (typeof view.matches)[number]) => <ResultForm match={m} draws={view.rule.draws} /> : undefined;
  return (
    <AppShell session={session} current="/admin/torneos" title={t.name} space="admin">
      <div className="tsec-head">
        <div>
          <span className="cx-muted">
            {t.sportLabel} · {view.teams.length} de {t.maxTeams} equipos · {t.zoneCount === 1 ? 'zona única → final' : `${t.zoneCount} zonas → semifinales y final`}
          </span>
          <h1 style={{ margin: 0 }}>{t.name}</h1>
        </div>
        <span className="cx-tag cx-tag--info">{STATUS_LABEL[t.status]}</span>
        {t.publicPage ? (
          <Link className="cx-btn cx-btn--secondary" href={`/torneos/${t.slug}`}>
            Ver página pública
          </Link>
        ) : null}
        {t.status === 'registration' ? <TournamentAction url={`/api/m/tournaments/${t.id}/draw`} label="Cerrar inscripción y sortear" busyLabel="Sorteando…" /> : null}
        {t.status === 'groups' && groupDone ? <TournamentAction url={`/api/m/tournaments/${t.id}/knockout`} label="Armar la eliminación" busyLabel="Armando…" /> : null}
      </div>
      <p className="cx-muted" style={{ margin: 0 }}>
        {playDayLabel(t.playDay)} · canchas {t.places.join(', ')} · {t.entryFee ? `inscripción ${formatMoney(t.entryFee)} por equipo` : 'sin costo'} · puntos: ganado {view.rule.win}
        {view.rule.draws ? `, empate ${view.rule.draw}` : ', sin empate'}
        {view.rule.loss ? `, perdido ${view.rule.loss}` : ''}
      </p>
      {t.status === 'registration' ? (
        <section className="cx-card" aria-label="Equipos inscriptos">
          <h2 className="cx-card__title" style={{ margin: 0 }}>
            Equipos inscriptos
          </h2>
          {view.teams.length === 0 ? <p className="cx-muted">Todavía no se inscribió ningún equipo.</p> : null}
          <ul className="rows">
            {view.teams.map((team) => (
              <li key={team.id}>
                <span className="grow">{team.name}</span>
                <span className={`cx-tag ${TEAM_STATUS[team.status]?.tone ?? ''}`}>{TEAM_STATUS[team.status]?.label ?? team.status}</span>
                <TournamentAction url={`/api/m/tournaments/teams/${team.id}/withdraw`} label="Dar de baja" busyLabel="Guardando…" variant="secondary" ariaLabel={`Dar de baja a ${team.name}`} />
              </li>
            ))}
          </ul>
          <p className="cx-muted" style={{ margin: 0, fontSize: 13 }}>
            {charges.filter((c) => c.chargeId).length} inscripciones con cargo en Finanzas. El sorteo arma las zonas y el fixture con horarios y canchas.
          </p>
        </section>
      ) : null}
      <Bracket view={view} action={action} />
      <ZoneTables view={view} />
      <GroupFixture view={view} action={action} />
      {record && view.matches.length ? (
        <p className="cx-muted" style={{ fontSize: 13 }}>
          Una corrección oficial pide motivo, queda auditada y la tabla se recalcula. Si la eliminación ya está armada pero no empezó, se vuelve a armar con la tabla corregida.
        </p>
      ) : null}
    </AppShell>
  );
}
