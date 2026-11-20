'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

type VenueOpt = { id: string; name: string; openFrom: number; openTo: number; slotMinutes: number };
type Msg = { tone: 'ok' | 'warn' | 'bad'; text: string } | null;

/** Nueva reserva fija para la persona elegida: espacio, día de la semana, turno y rango de fechas. */
export function SeriesForm({ person, venues, today, maxWeeks }: { person: { id: string; name: string }; venues: VenueOpt[]; today: string; maxWeeks: number }) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(venues[0]!.id);
  const venue = venues.find((v) => v.id === venueId)!;
  const times = Array.from({ length: Math.floor((venue.openTo - venue.openFrom) / venue.slotMinutes) }, (_, i) => hhmm(venue.openFrom + i * venue.slotMinutes));
  const [weekday, setWeekday] = useState(1);
  const [time, setTime] = useState(times.includes('20:00') ? '20:00' : times[0]!);
  const [fromDay, setFrom] = useState(today);
  const [untilDay, setUntil] = useState(plusDays(today, 12 * 7));
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await postJson<{ booked: string[]; skipped: Array<{ day: string; reason: string }> }>('/api/m/bookings/series', {
      venueId,
      personId: person.id,
      weekday,
      time: times.includes(time) ? time : times[0],
      fromDay,
      untilDay,
      label: label || undefined,
    });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    const { booked, skipped } = r.data;
    setMsg({
      tone: skipped.length ? 'warn' : 'ok',
      text: `Reserva fija cargada: ${booked.length} ${booked.length === 1 ? 'semana' : 'semanas'}.${skipped.length ? ` No se reservaron ${skipped.map((s) => dm(s.day)).join(', ')} (ocupado).` : ''}`,
    });
    router.refresh();
  }

  return (
    <form className="form-grid" onSubmit={submit} aria-label={`Reserva fija para ${person.name}`}>
      <p className="span-2">
        Para <strong>{person.name}</strong>
      </p>
      <div className="cx-field">
        <label className="cx-label" htmlFor="series-venue">
          Espacio
        </label>
        <select id="series-venue" className="cx-select" value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="cx-field">
        <label className="cx-label" htmlFor="series-weekday">
          Día
        </label>
        <select id="series-weekday" className="cx-select" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
          {WEEKDAYS.map((w, i) => (
            <option key={w} value={i}>
              {w}
            </option>
          ))}
        </select>
      </div>
      <div className="cx-field">
        <label className="cx-label" htmlFor="series-time">
          Turno
        </label>
        <select id="series-time" className="cx-select" value={times.includes(time) ? time : times[0]} onChange={(e) => setTime(e.target.value)}>
          {times.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <Field label="Nombre (opcional)" name="label" maxLength={80} placeholder="Grupo de los martes" value={label} onChange={(e) => setLabel(e.target.value)} />
      <Field label="Desde" name="fromDay" type="date" min={today} required value={fromDay} onChange={(e) => setFrom(e.target.value)} />
      <Field label="Hasta" name="untilDay" type="date" min={fromDay} required hint={`Hasta ${maxWeeks} semanas.`} value={untilDay} onChange={(e) => setUntil(e.target.value)} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" disabled={busy}>
            Cargar reserva fija
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Cancelar la serie entera (las semanas que no empezaron). La persona recibe un aviso. */
export function CancelSeries({ id, title, weeks }: { id: string; title: string; weeks: number }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    const r = await postJson(`/api/m/bookings/series/${id}/cancel`, {});
    if (!r.ok) return setError(r.error.message);
    setAsk(false);
    router.refresh();
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <div className="adm-actions">
        {ask ? (
          <>
            <Button variant="danger" onClick={cancel}>
              Sí, cancelar {weeks} {weeks === 1 ? 'semana' : 'semanas'}
            </Button>
            <Button variant="secondary" onClick={() => setAsk(false)}>
              No
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setAsk(true)} aria-label={`Cancelar reserva fija: ${title}`}>
            Cancelar la serie
          </Button>
        )}
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}
