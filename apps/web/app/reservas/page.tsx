import { clubDayOf } from '@clumera/agenda';
import { formatMoney } from '@clumera/finance';
import { availability, bookableVenues, isMember, myBookings } from '@clumera/module-bookings';
import { Card, Notice } from '@clumera/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { forbidden } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { BookingActions } from '@/components/BookingForms';
import { permissionChecker } from '@/lib/authz';
import { sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { requireSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Reservas' };
export const dynamic = 'force-dynamic';

const WEEKDAY = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const STATUS: Record<string, { label: string; tone: string }> = {
  held: { label: 'Esperando el pago', tone: 'cx-tag--warn' },
  confirmed: { label: 'Confirmada', tone: 'cx-tag--ok' },
  cancelled: { label: 'Cancelada', tone: '' },
  expired: { label: 'Liberada sin pago', tone: '' },
  conflict: { label: 'Pago tardío · reintegro', tone: 'cx-tag--bad' },
};
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Search = Promise<{ grupo?: string; espacio?: string; dia?: string; vista?: string; ok?: string }>;

/**
 * Turnero del socio (lienzo «Reservas · turnero»): instalación, fecha y horarios libres de la agenda
 * central. Ocupado muestra el motivo (escuela, torneo, reservado), nunca quién reservó.
 */
export default async function BookingsPage({ searchParams }: { searchParams: Search }) {
  await requireModulePage('bookings');
  const session = await requireSession('/reservas');
  const can = await permissionChecker(session.personId);
  if (!can('bookings:book')) forbidden();
  const q = await searchParams;
  await sweepHolds();
  const db = getPrisma();
  const now = new Date();
  const [venues, mine, member] = await Promise.all([bookableVenues(db), myBookings(db, [session.personId], now), isMember(db, session.personId, now)]);
  const upcoming = mine.filter((b) => b.status === 'held' || b.status === 'conflict' || (b.status === 'confirmed' && b.endsAt > now));
  const mineView = q.vista === 'mias';

  const groups = [...new Set(venues.map((v) => v.group))];
  const group = groups.includes(q.grupo ?? '') ? q.grupo! : (venues.find((v) => v.id === q.espacio)?.group ?? groups[0]);
  const inGroup = venues.filter((v) => v.group === group);
  const venue = inGroup.find((v) => v.id === q.espacio) ?? inGroup[0];
  const today = clubDayOf(now).day;
  const days = venue ? Array.from({ length: Math.min(7, venue.rule.maxAdvanceDays + 1) }, (_, i) => plusDays(today, i)) : [];
  const day = days.includes(q.dia ?? '') ? q.dia! : days[0];
  const slots = venue && day ? ((await availability(db, venue.id, day, member, now)) ?? []) : [];
  const link = (p: Record<string, string | undefined>) => `/reservas?${new URLSearchParams(Object.entries({ grupo: group, espacio: venue?.id, dia: day, ...p }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;

  return (
    <AppShell session={session} current="/reservas" title="Reservas">
      <h1>Reservas</h1>
      <nav className="seg-tabs" aria-label="Reservas">
        <Link href="/reservas" aria-current={mineView ? undefined : 'page'}>
          Reservar
        </Link>
        <Link href="/reservas?vista=mias" aria-current={mineView ? 'page' : undefined}>
          Mis reservas{upcoming.length ? ` (${upcoming.length})` : ''}
        </Link>
      </nav>

      {mineView ? (
        <section className="cx-stack" aria-label="Mis reservas">
          {q.ok ? <Notice tone="ok">Reserva confirmada. El cargo quedó en tu cuenta para pagarlo en el club.</Notice> : null}
          {mine.length === 0 ? <p className="cx-muted">No tenés reservas.</p> : null}
          {mine.map((b) => (
            <Card key={b.id} aria-label={`Reserva ${b.title}`}>
              <div className="team-card__head">
                <h2 className="cx-card__title" style={{ margin: 0 }}>
                  {b.title}
                </h2>
                <span className={`cx-tag ${STATUS[b.status]?.tone ?? ''}`}>{STATUS[b.status]?.label}</span>
              </div>
              <p className="cx-muted">
                {formatMoney(b.price)} {b.memberRate ? '· tarifa socio' : ''}
                {b.paid ? ` · pagado ${formatMoney(b.paid)}` : ''}
                {b.pending && b.status !== 'cancelled' && b.status !== 'expired' ? ` · a pagar ${formatMoney(b.pending)}` : ''}
                {b.payMode === 'deposit' && b.status === 'confirmed' ? ` · saldo ${formatMoney(b.price - b.chargeAmount)} en el club` : ''}
              </p>
              {b.status === 'held' && b.holdExpiresAt ? <p className="cx-muted">Retenido hasta las {new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(b.holdExpiresAt)}.</p> : null}
              {b.refundDue ? <p>El club te devuelve {formatMoney(b.refundDue)}.</p> : null}
              {b.status === 'confirmed' && !b.cancellable && b.startsAt > now ? <p className="cx-muted">Para cancelar con menos de {b.cancelHours} h, comunicate con el club.</p> : null}
              <BookingActions id={b.id} chargeId={b.chargeId} payable={b.status === 'held' && b.pending > 0} cancellable={b.cancellable} title={b.title} />
            </Card>
          ))}
        </section>
      ) : venues.length === 0 ? (
        <p className="cx-muted">El club todavía no tiene espacios para reservar online.</p>
      ) : (
        <div className="booking-layout">
          <section className="cx-stack" aria-label="Elegir turno">
            <h2 className="home-sec">Instalación</h2>
            <div className="chip-row" role="group" aria-label="Instalación">
              {groups.map((g) => {
                const n = venues.filter((v) => v.group === g).length;
                return (
                  <Link key={g} className="chip" href={`/reservas?grupo=${encodeURIComponent(g)}`} aria-pressed={g === group}>
                    {g}
                    <small>{n === 1 ? (venues.find((v) => v.group === g)!.detail || '1 espacio') : `${n} espacios`}</small>
                  </Link>
                );
              })}
            </div>
            {inGroup.length > 1 ? (
              <div className="chip-row" role="group" aria-label="Espacio">
                {inGroup.map((v) => (
                  <Link key={v.id} className="chip chip--small" href={link({ espacio: v.id })} aria-pressed={v.id === venue?.id}>
                    {v.name}
                  </Link>
                ))}
              </div>
            ) : null}
            <h2 className="home-sec">Fecha</h2>
            <div className="chip-row chip-row--days" role="group" aria-label="Fecha">
              {days.map((d) => (
                <Link key={d} className="chip chip--day" href={link({ dia: d })} aria-pressed={d === day} aria-label={`${WEEKDAY[clubDayOf(new Date(`${d}T15:00:00Z`)).weekday]} ${d.slice(8)}`}>
                  {d === today ? 'Hoy' : WEEKDAY[clubDayOf(new Date(`${d}T15:00:00Z`)).weekday]}
                  <b>{d.slice(8)}</b>
                </Link>
              ))}
            </div>
          </section>
          <section className="cx-stack" aria-label="Horarios">
            <h2 className="home-sec">
              {venue?.name} · {venue?.rule.slotMinutes} min
            </h2>
            <div className="slot-grid">
              {slots.map((s) =>
                s.state === 'free' ? (
                  <Link key={s.start} className="slot slot--free" href={`/reservas/confirmar?espacio=${venue!.id}&inicio=${encodeURIComponent(s.startsAt.toISOString())}`} aria-label={`${s.start} libre, ${s.price !== null ? formatMoney(s.price) : ''}`}>
                    {s.start}
                    <small>{s.price !== null ? formatMoney(s.price) : 'Libre'}</small>
                  </Link>
                ) : (
                  <span key={s.start} className={`slot slot--${s.state}`} aria-label={`${s.start} ${s.label}`}>
                    {s.start}
                    <small>{s.label}</small>
                  </span>
                ),
              )}
            </div>
            <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
              {member ? 'Precios con tarifa socio.' : 'Precios de no socio.'} Ocupados = partidos, escuelas, eventos, mantenimiento u otras reservas: lo calcula la agenda central del club.
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
