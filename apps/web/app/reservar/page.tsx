import { clubDayOf } from '@clumera/agenda';
import { formatMoney } from '@clumera/finance';
import { availability, publicVenues } from '@clumera/module-bookings';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PublicShell } from '@/components/PublicShell';
import { sweepHolds } from '@/lib/bookings-access';
import { getPrisma } from '@/lib/db';
import { requireModulePage } from '@/lib/require-module';
import { getCurrentSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Reservá una cancha' };
export const dynamic = 'force-dynamic';

const WEEKDAY = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Search = Promise<{ grupo?: string; espacio?: string; dia?: string }>;

/**
 * Reserva pública sin cuenta (lienzo «Público · reservar sin cuenta»): los espacios que el club
 * habilitó para el público, con tarifa general. Ocupado muestra el motivo, nunca quién reservó.
 * Quien tiene sesión va al turnero del club (con su tarifa).
 */
export default async function PublicBookingPage({ searchParams }: { searchParams: Search }) {
  await requireModulePage('bookings');
  if (await getCurrentSession()) redirect('/reservas');
  const q = await searchParams;
  await sweepHolds();
  const db = getPrisma();
  const now = new Date();
  const venues = await publicVenues(db);
  const groups = [...new Set(venues.map((v) => v.group))];
  const group = groups.includes(q.grupo ?? '') ? q.grupo! : (venues.find((v) => v.id === q.espacio)?.group ?? groups[0]);
  const inGroup = venues.filter((v) => v.group === group);
  const venue = inGroup.find((v) => v.id === q.espacio) ?? inGroup[0];
  const today = clubDayOf(now).day;
  const days = venue ? Array.from({ length: Math.min(7, venue.rule.maxAdvanceDays + 1) }, (_, i) => plusDays(today, i)) : [];
  const day = days.includes(q.dia ?? '') ? q.dia! : days[0];
  const slots = venue && day ? ((await availability(db, venue.id, day, false, now)) ?? []) : [];
  const link = (p: Record<string, string | undefined>) => `/reservar?${new URLSearchParams(Object.entries({ grupo: group, espacio: venue?.id, dia: day, ...p }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;

  return (
    <PublicShell next="/reservas">
      <div>
        <h1>Reservá una cancha</h1>
        <p className="cx-muted">No hace falta ser socio ni crear una cuenta.</p>
      </div>
      {venues.length === 0 ? (
        <p className="cx-muted">El club todavía no tiene espacios para reservar sin cuenta.</p>
      ) : (
        <div className="booking-layout">
          <section className="cx-stack" aria-label="Elegir turno">
            <h2 className="home-sec">Instalación</h2>
            <div className="chip-row" role="group" aria-label="Instalación">
              {groups.map((g) => {
                const n = venues.filter((v) => v.group === g).length;
                return (
                  <Link key={g} className="chip" href={`/reservar?grupo=${encodeURIComponent(g)}`} aria-pressed={g === group}>
                    {g}
                    <small>{n === 1 ? venues.find((v) => v.group === g)!.detail || '1 espacio' : `${n} espacios`}</small>
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
                s.state === 'free' && s.price !== null ? (
                  <Link key={s.start} className="slot slot--free" href={`/reservar/confirmar?espacio=${venue!.id}&inicio=${encodeURIComponent(s.startsAt.toISOString())}`} aria-label={`${s.start} libre, ${formatMoney(s.price)}`}>
                    {s.start}
                    <small>{formatMoney(s.price)}</small>
                  </Link>
                ) : (
                  <span key={s.start} className={`slot slot--${s.state === 'free' ? 'closed' : s.state}`} aria-label={`${s.start} ${s.label}`}>
                    {s.start}
                    <small>{s.label}</small>
                  </span>
                ),
              )}
            </div>
            <p className="cx-muted" style={{ fontSize: 'var(--cx-fs-small)' }}>
              Precios de tarifa general. ¿Sos socio?{' '}
              <Link className="cx-link" href="/ingresar?next=%2Freservas">
                Ingresá
              </Link>{' '}
              para reservar con tarifa socio.
            </p>
          </section>
        </div>
      )}
    </PublicShell>
  );
}
