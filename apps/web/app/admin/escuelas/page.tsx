import { formatMoney } from '@clumera/finance';
import { clubToday, groupEnrollments, schoolsAdmin } from '@clumera/module-schools';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { IssueFees, NewGroupForm, NewProgramForm, WithdrawEnrollment } from '@/components/SchoolForms';
import { requireAdmin } from '@/lib/admin';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Escuelas' };
export const dynamic = 'force-dynamic';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const STATUS: Record<string, { label: string; tone: string }> = {
  confirmed: { label: 'Confirmada', tone: 'cx-tag--ok' },
  pending: { label: 'Pendiente', tone: 'cx-tag--warn' },
  waitlist: { label: 'Espera', tone: 'cx-tag--info' },
  withdrawn: { label: 'Baja', tone: '' },
};

/**
 * Coordinación de Escuelas (lienzo «Actividades · escuelas y colonia»): propuestas y grupos con cupo,
 * indicadores, inscripciones recientes, bajas y emisión de cuotas del mes.
 */
export default async function SchoolsAdminPage() {
  await requireModulePage('schools');
  const { session } = await requireAdmin('/admin/escuelas', 'schools:manage');
  const db = getPrisma();
  const { programs, kpis, recent } = await schoolsAdmin(db);
  const rosters = new Map(await Promise.all(programs.flatMap((p) => p.groups.map(async (g) => [g.id, await groupEnrollments(db, g.id)] as const))));
  const { period } = clubToday();
  const monthLabel = `${MONTHS[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}`;
  return (
    <AppShell session={session} current="/admin/escuelas" title="Escuelas" space="admin">
      <header className="agenda-bar">
        <h1>Escuelas</h1>
        <IssueFees period={period} label={monthLabel} />
      </header>
      <div className="reception__counts" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="kpi">
          <span className="cx-muted">Inscriptos confirmados</span>
          <b>
            {kpis.confirmed} / {kpis.capacity}
          </b>
        </div>
        <div className="kpi">
          <span className="cx-muted">Lista de espera</span>
          <b>{kpis.waitlist}</b>
        </div>
        <div className="kpi">
          <span className="cx-muted">Propuestas</span>
          <b>{programs.length}</b>
        </div>
      </div>
      <div className="cx-columns">
        <section className="cx-stack" aria-label="Propuestas y grupos">
          {programs.map((p) => (
            <Card key={p.id} aria-label={`Propuesta ${p.name}`}>
              <div className="team-card__head">
                <h2 className="cx-card__title" style={{ margin: 0 }}>
                  {p.name}
                </h2>
                <span className={`cx-tag ${p.status === 'open' ? 'cx-tag--ok' : ''}`}>{p.status === 'open' ? 'Abierta' : 'Cerrada'}</span>
              </div>
              <p className="cx-muted">
                {p.minAge !== null || p.maxAge !== null ? `${p.minAge ?? 0} a ${p.maxAge ?? 99} años · ` : ''}
                {formatMoney(p.memberFee)} socio · {formatMoney(p.guestFee)} general{p.membersOnly ? ' · solo socios' : ''} · actividad «{p.activity}»
              </p>
              <ul className="group-list">
                {p.groups.map((g) => (
                  <li key={g.id}>
                    <details>
                      <summary>
                        <span className="grow">
                          <strong>{g.name}</strong>
                          <span className="cx-muted" style={{ display: 'block' }}>
                            {g.schedule}
                            {g.place ? ` · ${g.place}` : ''}
                            {g.teacherName ? ` · Prof. ${g.teacherName}` : ''}
                          </span>
                        </span>
                        <span className="capacity capacity--inline" aria-hidden="true">
                          <span style={{ width: `${Math.min(100, Math.round((g.taken / g.capacity) * 100))}%` }} />
                        </span>
                        <span className="cx-tag">
                          {g.taken} / {g.capacity}
                          {g.waiting ? ` · ${g.waiting} en espera` : ''}
                        </span>
                      </summary>
                      <div className="rows">
                        {(rosters.get(g.id) ?? []).map((e) => (
                          <div key={e.id}>
                            <span className="grow">
                              {e.person.firstName} {e.person.lastName}
                              <span className="cx-muted" style={{ display: 'block' }}>
                                {STATUS[e.status]!.label}
                                {e.status === 'waitlist' ? ` · ${e.waitPosition}°` : ''} · {formatMoney(e.fee)}
                              </span>
                            </span>
                            <WithdrawEnrollment id={e.id} title={`${e.person.firstName} ${e.person.lastName} · ${g.name}`} waiting={e.status === 'waitlist'} />
                          </div>
                        ))}
                        {(rosters.get(g.id) ?? []).length === 0 ? <p className="cx-muted">Sin inscriptos.</p> : null}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
              <details>
                <summary className="cx-link">Agregar un grupo</summary>
                <NewGroupForm programId={p.id} programName={p.name} />
              </details>
            </Card>
          ))}
          {programs.length === 0 ? <p className="cx-muted">Todavía no hay propuestas.</p> : null}
        </section>
        <div className="cx-stack">
          <Card title="Inscripciones recientes">
            <div className="rows">
              {recent.map((e) => (
                <div key={e.id}>
                  <span className="grow">
                    <strong>
                      {e.person.firstName} {e.person.lastName}
                    </strong>
                    <span className="cx-muted" style={{ display: 'block' }}>
                      {e.group.program.name} · {e.group.name}
                    </span>
                  </span>
                  <span className={`cx-tag ${STATUS[e.status]!.tone}`}>
                    {STATUS[e.status]!.label}
                    {e.status === 'waitlist' ? ` · ${e.waitPosition}°` : ''}
                  </span>
                </div>
              ))}
              {recent.length === 0 ? <p className="cx-muted">Sin inscripciones todavía.</p> : null}
            </div>
          </Card>
          <Card title="Nueva propuesta">
            <NewProgramForm />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
