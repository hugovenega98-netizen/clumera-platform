import { periodOf } from '@clumera/finance';
import { SPORTS, sportsOverview } from '@clumera/sports';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { NewSportForm, NewTeamForm, TeamFeesForm } from '@/components/SportsAdminForms';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { formatMoney } from '@clumera/finance';

export const metadata: Metadata = { title: 'Deportes' };
export const dynamic = 'force-dynamic';

/** Deportes del club, equipos con su arancel y planteles; emisión de aranceles a Finanzas. */
export default async function SportsAdmin() {
  const { session, can } = await requireAdmin('/admin/deportes', 'sports:manage');
  const sports = await sportsOverview(getPrisma());
  return (
    <AppShell session={session} current="/admin/deportes" title="Deportes" space="admin">
      <h1>Deportes</h1>
      <div className="cx-columns">
        {sports.map((s) => (
          <Card key={s.id} title={s.name}>
            <p className="cx-muted">
              {SPORTS.find((c) => c.code === s.code)?.label} · ámbito <code>{s.slug}</code>
            </p>
            <div className="rows">
              {s.teams.map((t) => (
                <div key={t.id}>
                  <span className="grow">
                    <Link className="cx-link" href={`/admin/deportes/equipos/${t.id}`}>
                      {t.name}
                    </Link>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {t._count.members} {t._count.members === 1 ? 'jugador' : 'jugadores'} · {t.monthlyFee ? `arancel ${formatMoney(t.monthlyFee)}` : 'sin arancel'}
                    </span>
                  </span>
                </div>
              ))}
              {s.teams.length === 0 ? <p className="cx-muted">Sin equipos.</p> : null}
            </div>
          </Card>
        ))}
      </div>
      <div className="cx-columns">
        <Card title="Nuevo equipo">{sports.length ? <NewTeamForm sports={sports.map((s) => ({ id: s.id, name: s.name, slug: s.slug }))} /> : <p className="cx-muted">Primero creá un deporte.</p>}</Card>
        <Card title="Nuevo deporte">
          <NewSportForm catalog={SPORTS.map((s) => ({ code: s.code, label: s.label }))} />
        </Card>
      </div>
      {can('finance:charge.issue') ? (
        <Card title="Aranceles del mes">
          <TeamFeesForm period={periodOf(new Date())} />
        </Card>
      ) : null}
    </AppShell>
  );
}
