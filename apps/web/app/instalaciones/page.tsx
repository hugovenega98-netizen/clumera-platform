import { agendaDay, clubDayOf } from '@clumera/agenda';
import { VENUE_STATUS_LABEL } from '@clumera/module-facilities';
import { Card } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { BlockForm, RemoveBlock, VenueStatusForm } from '@/components/FacilitiesForms';
import { requireAdmin } from '@/lib/admin';
import { managedVenues, sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';

export const metadata: Metadata = { title: 'Agenda central' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, { label: string; cls: string }> = {
  match: { label: 'Deportes', cls: 'ag--match' },
  booking: { label: 'Reserva', cls: 'ag--booking' },
  school: { label: 'Escuelas y colonia', cls: 'ag--school' },
  tournament: { label: 'Torneo', cls: 'ag--tournament' },
  event: { label: 'Evento', cls: 'ag--event' },
  block: { label: 'Mantenimiento / bloqueo', cls: 'ag--block' },
};
const FROM = 8 * 60;
const TO = 24 * 60;
const hh = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const longDay = (day: string) => {
  const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const plus = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Agenda central (lienzo «Instalaciones · agenda central»): qué ocupa cada espacio en el día,
 * de cualquier módulo, con el estado físico aparte. Bloqueos y estado para quien administra.
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string }> }) {
  await requireModulePage('facilities');
  const { session, can } = await requireAdmin('/instalaciones', 'facilities:venue.view');
  const q = await searchParams;
  const today = clubDayOf(new Date()).day;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q.dia ?? '') ? q.dia! : today;
  await sweepHolds();
  const db = getPrisma();
  const venues = await managedVenues(session.personId, 'facilities:venue.view');
  const rows = await agendaDay(
    db,
    day,
    venues.map((v) => v.id),
  );
  const canBlock = venues.filter((v) => can('facilities:block.manage', { scopes: [{ type: 'venue', id: v.slug }] }));
  const canStatus = venues.filter((v) => can('facilities:venue.manage', { scopes: [{ type: 'venue', id: v.slug }] }));
  const busyMinutes = rows.reduce((n, r) => n + r.slots.reduce((m, s) => m + Math.max(0, Math.min(s.toMinute, TO) - Math.max(s.fromMinute, FROM)), 0), 0);
  const capacity = rows.length * (TO - FROM);
  const blocks = rows.flatMap((r) => r.slots.filter((s) => s.kind === 'block').map((s) => ({ ...s, venue: r.venue.name })));
  const hours = Array.from({ length: (TO - FROM) / 60 }, (_, i) => FROM + i * 60);
  return (
    <AppShell session={session} current="/instalaciones" title="Agenda central" space="admin">
      <header className="agenda-bar">
        <h1>Agenda central</h1>
        <nav className="day-nav" aria-label="Día">
          <Link className="cx-btn cx-btn--secondary" href={`/instalaciones?dia=${plus(day, -1)}`} aria-label="Día anterior">
            ‹
          </Link>
          <b>{day === today ? `Hoy, ${longDay(day).toLowerCase()}` : longDay(day)}</b>
          <Link className="cx-btn cx-btn--secondary" href={`/instalaciones?dia=${plus(day, 1)}`} aria-label="Día siguiente">
            ›
          </Link>
        </nav>
        <Link className="cx-link" href="/instalaciones/espacios">
          Espacios, reglas y tarifas
        </Link>
      </header>
      <div className="agenda-legend" aria-label="Referencias">
        {Object.values(KIND).map((k) => (
          <span key={k.cls}>
            <i className={`ag ${k.cls}`} aria-hidden="true" />
            {k.label}
          </span>
        ))}
        <span className="cx-muted">
          · {rows.length} espacios · {capacity ? Math.round((busyMinutes / capacity) * 100) : 0}% de horas ocupadas
        </span>
      </div>

      <section className="cx-card agenda" aria-label="Agenda del día">
        <div className="agenda__grid" style={{ ['--ag-cols' as string]: (TO - FROM) / 30 }}>
          <div className="agenda__hours" aria-hidden="true">
            <span />
            <div>
              {hours.map((h) => (
                <span key={h}>{hh(h)}</span>
              ))}
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.venue.id} className="agenda__row" role="group" aria-label={r.venue.name}>
              <div className="agenda__name">
                <b>{r.venue.name}</b>
                <small>
                  {r.venue.group}
                  {r.venue.status !== 'available' ? ` · ${VENUE_STATUS_LABEL[r.venue.status]}` : ''}
                </small>
              </div>
              <ol className="agenda__track">
                {r.slots.length === 0 ? <li className="agenda__empty cx-muted">Libre todo el día</li> : null}
                {r.slots.map((s) => {
                  const from = Math.max(s.fromMinute, FROM);
                  const to = Math.min(s.toMinute, TO);
                  return (
                    <li
                      key={s.id}
                      className={`ag ${KIND[s.kind]?.cls ?? ''}${s.status === 'held' ? ' ag--held' : ''}`}
                      title={`${hh(s.fromMinute)}–${hh(s.toMinute)} ${s.kind === 'block' ? s.label : KIND[s.kind]?.label}${s.status === 'held' ? ' · esperando pago' : ''}`}
                      style={{ ['--ag-at' as string]: `${Math.floor((from - FROM) / 30) + 1} / ${Math.max(Math.ceil((to - FROM) / 30), Math.floor((from - FROM) / 30) + 1) + 1}` }}
                    >
                      <b>
                        {hh(s.fromMinute)}–{hh(s.toMinute)}
                      </b>{' '}
                      {s.kind === 'block' ? s.label : KIND[s.kind]?.label}
                      {s.status === 'held' ? ' · esperando pago' : ''}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <div className="cx-columns">
        {canBlock.length ? (
          <Card title="Bloqueos">
            {blocks.length ? (
              <div className="rows" aria-label="Bloqueos del día">
                {blocks.map((b) => (
                  <div key={b.id}>
                    <span className="grow">
                      <b>{b.venue}</b> · {hh(b.fromMinute)}–{hh(b.toMinute)} · {b.label}
                    </span>
                    {canBlock.some((v) => v.id === b.venueId) ? <RemoveBlock id={b.id} label={b.label} /> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="cx-muted">Sin bloqueos este día.</p>
            )}
            <h3 className="cx-card__title" style={{ marginTop: 'var(--cx-space-3)' }}>
              Nuevo bloqueo
            </h3>
            <p className="cx-muted">Tiene la prioridad más alta: libera turnos retenidos sin pagar, pero no pisa reservas confirmadas.</p>
            <BlockForm venues={canBlock.map((v) => ({ id: v.id, name: v.name }))} day={day} />
          </Card>
        ) : null}
        <Card title="Estado físico de los espacios">
          <div className="cx-stack">
            <div className="chip-row">
              {venues.map((v) => (
                <span key={v.id} className={`cx-tag ${v.status === 'available' ? 'cx-tag--ok' : v.status === 'maintenance' ? 'cx-tag--warn' : 'cx-tag--bad'}`}>
                  {v.name} · {VENUE_STATUS_LABEL[v.status]}
                  {v.statusNote ? ` (${v.statusNote})` : ''}
                </span>
              ))}
            </div>
            {canStatus.length ? (
              <details>
                <summary className="cx-link">Cambiar el estado de un espacio</summary>
                <div className="cx-stack" style={{ marginTop: 'var(--cx-space-3)' }}>
                  {canStatus.map((v) => (
                    <VenueStatusForm key={v.id} venue={{ id: v.id, name: v.name, status: v.status, statusNote: v.statusNote }} />
                  ))}
                </div>
              </details>
            ) : null}
            <p className="cx-muted">El estado físico y la ocupación horaria se muestran por separado.</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
