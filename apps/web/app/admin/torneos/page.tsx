import { clubDayOf } from '@clumera/agenda';
import { listTournaments, STATUS_LABEL } from '@clumera/module-tournaments';
import { SPORTS, sportDefinition } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { CreateTournamentForm } from '@/components/TournamentForms';
import { playDayLabel } from '@/components/TournamentViews';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Torneos' };
export const dynamic = 'force-dynamic';

/** Organización de torneos: lista y alta de un torneo relámpago. */
export default async function TournamentsAdminPage() {
  await requireModulePage('tournaments');
  const { session } = await requireAdmin('/admin/torneos', 'tournaments:manage');
  const tournaments = await listTournaments(getPrisma());
  const today = clubDayOf(new Date()).day;
  return (
    <AppShell session={session} current="/admin/torneos" title="Torneos" space="admin">
      <h1>Torneos</h1>
      <section className="cx-stack" aria-label="Torneos del club">
        {tournaments.length === 0 ? <p className="cx-muted">Todavía no hay torneos.</p> : null}
        {tournaments.map((t) => (
          <Link key={t.id} className="home-row" href={`/admin/torneos/${t.slug}`} aria-label={`${t.name}: ${STATUS_LABEL[t.status]}`}>
            <span className="enroll-row__avatar" aria-hidden="true">
              {t.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="home-row__body">
              <strong>{t.name}</strong>
              <span className="cx-muted">
                {sportDefinition(t.sportCode)?.label ?? t.sportCode} · {playDayLabel(t.playDay)} · {t._count.teams} de {t.maxTeams} equipos
              </span>
            </span>
            <span className={`cx-tag ${t.status === 'registration' ? 'cx-tag--ok' : 'cx-tag--info'}`}>{STATUS_LABEL[t.status]}</span>
          </Link>
        ))}
      </section>
      <Card aria-label="Nuevo torneo">
        <h2 className="cx-card__title" style={{ margin: 0 }}>
          Nuevo torneo relámpago
        </h2>
        <p className="cx-muted" style={{ margin: 0 }}>
          Fase de grupos todos contra todos y eliminación directa. Los puntos salen de las reglas del deporte.
        </p>
        <CreateTournamentForm sports={SPORTS.map((s) => ({ code: s.code, label: s.label }))} defaultDay={today} />
      </Card>
    </AppShell>
  );
}
