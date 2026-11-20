'use client';

import { parseMoney } from '@clumera/finance/money';
import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

type Msg = { tone: 'ok' | 'bad'; text: string } | null;
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const toHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function send(method: 'PATCH' | 'PUT' | 'DELETE', url: string, body?: unknown): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { method, headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, message: data.error?.message ?? `Error ${res.status}` };
  } catch {
    return { ok: false, message: 'No hay conexión. Probá de nuevo.' };
  }
}

function VenueSelect({ id, venues, value, onChange }: { id: string; venues: Array<{ id: string; name: string }>; value: string; onChange: (v: string) => void }) {
  return (
    <div className="cx-field">
      <label className="cx-label" htmlFor={id}>
        Espacio
      </label>
      <select id={id} className="cx-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Bloqueo de un espacio (mantenimiento, armado de un evento). */
export function BlockForm({ venues, day }: { venues: Array<{ id: string; name: string }>; day: string }) {
  const router = useRouter();
  const [venueId, setVenueId] = useState(venues[0]?.id ?? '');
  const [d, setD] = useState(day);
  const [from, setFrom] = useState('08:00');
  const [to, setTo] = useState('12:00');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson('/api/m/facilities/blocks', { venueId, day: d, fromMinute: toMin(from), toMinute: to === '00:00' ? 1440 : toMin(to), reason });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: 'Bloqueo cargado en la agenda.' });
    setReason('');
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nuevo bloqueo">
      <VenueSelect id="block-venue" venues={venues} value={venueId} onChange={setVenueId} />
      <Field label="Día" name="day" type="date" required value={d} onChange={(e) => setD(e.target.value)} />
      <Field label="Desde" name="from" type="time" step={1800} required value={from} onChange={(e) => setFrom(e.target.value)} />
      <Field label="Hasta" name="to" type="time" step={1800} required value={to} onChange={(e) => setTo(e.target.value)} />
      <Field className="span-2" label="Motivo" name="reason" required minLength={3} maxLength={80} placeholder="Mantenimiento, resiembra, armado…" value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit">Bloquear</Button>
        </div>
      </div>
    </form>
  );
}

export function RemoveBlock({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  return (
    <span>
      <button
        type="button"
        className="cx-link-button"
        aria-label={`Quitar bloqueo: ${label}`}
        onClick={async () => {
          const r = await send('DELETE', `/api/m/facilities/blocks/${id}`);
          if (!r.ok) return setError(r.message);
          router.refresh();
        }}
      >
        Quitar
      </button>
      {error ? <span role="alert"> {error}</span> : null}
    </span>
  );
}

const STATUS = [
  { value: 'available', label: 'Disponible' },
  { value: 'maintenance', label: 'En mantenimiento' },
  { value: 'out_of_service', label: 'Fuera de servicio' },
];

/** Estado físico de un espacio (aparte de la ocupación horaria). */
export function VenueStatusForm({ venue }: { venue: { id: string; name: string; status: string; statusNote: string } }) {
  const router = useRouter();
  const [status, setStatus] = useState(venue.status);
  const [note, setNote] = useState(venue.statusNote);
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await send('PATCH', `/api/m/facilities/venues/${venue.id}`, { status, note });
    setMsg(r.ok ? { tone: 'ok', text: 'Estado actualizado.' } : { tone: 'bad', text: r.message });
    if (r.ok) router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label={`Estado de ${venue.name}`}>
      <div className="cx-field">
        <label className="cx-label" htmlFor={`st-${venue.id}`}>
          Estado de {venue.name}
        </label>
        <select id={`st-${venue.id}`} className="cx-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <Field label="Nota" name="note" maxLength={120} placeholder="Hasta las 18, resiembra…" value={note} onChange={(e) => setNote(e.target.value)} disabled={status === 'available'} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Guardar estado
          </Button>
        </div>
      </div>
    </form>
  );
}

export function CreateVenueForm() {
  const router = useRouter();
  const [v, setV] = useState({ name: '', slug: '', group: '', detail: '' });
  const [msg, setMsg] = useState<Msg>(null);
  const slugOf = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson('/api/m/facilities/venues', v);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: `${v.name} creado. Cargale reglas y tarifas para reservarlo.` });
    setV({ name: '', slug: '', group: '', detail: '' });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nuevo espacio">
      <Field label="Nombre" name="name" required maxLength={60} placeholder="Pádel 3" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, slug: slugOf(e.target.value) })} />
      <Field label="Tipo (agrupa en el turnero)" name="group" required maxLength={40} placeholder="Pádel" value={v.group} onChange={(e) => setV({ ...v, group: e.target.value })} />
      <Field label="Detalle" name="detail" maxLength={60} placeholder="Techada, 40 personas…" value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} />
      <Field label="Identificador" name="slug" required maxLength={40} hint="Para asignar encargados por espacio." value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit">Crear espacio</Button>
        </div>
      </div>
    </form>
  );
}

export interface RuleView {
  slotMinutes: number;
  openFrom: number;
  openTo: number;
  maxAdvanceDays: number;
  holdMinutes: number;
  cancelHours: number;
  depositPercent: number;
  payAtClub: boolean;
  publicBooking: boolean;
}

/** Reglas de reserva: turnos, horario, anticipación, retención, cancelación y seña. */
export function RuleForm({ venueId, venueName, rule }: { venueId: string; venueName: string; rule: RuleView | null }) {
  const router = useRouter();
  const r0 = rule ?? { slotMinutes: 60, openFrom: 480, openTo: 1380, maxAdvanceDays: 14, holdMinutes: 10, cancelHours: 24, depositPercent: 50, payAtClub: false, publicBooking: false };
  const [v, setV] = useState({ ...r0, from: toHhmm(r0.openFrom), to: toHhmm(r0.openTo) });
  const [msg, setMsg] = useState<Msg>(null);
  const num = (k: keyof RuleView) => (e: { target: { value: string } }) => setV({ ...v, [k]: Number(e.target.value) });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const { from, to, ...rest } = v;
    const r = await send('PUT', `/api/m/facilities/venues/${venueId}/rule`, { ...rest, openFrom: toMin(from), openTo: to === '00:00' ? 1440 : toMin(to) });
    setMsg(r.ok ? { tone: 'ok', text: 'Reglas guardadas.' } : { tone: 'bad', text: r.message });
    if (r.ok) router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label={`Reglas de ${venueName}`}>
      <Field label="Turno (minutos)" name="slotMinutes" type="number" min={15} max={480} step={15} value={v.slotMinutes} onChange={num('slotMinutes')} />
      <Field label="Anticipación máxima (días)" name="maxAdvanceDays" type="number" min={0} max={365} value={v.maxAdvanceDays} onChange={num('maxAdvanceDays')} />
      <Field label="Abre" name="from" type="time" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />
      <Field label="Cierra" name="to" type="time" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />
      <Field label="Seña (%)" name="depositPercent" type="number" min={0} max={100} hint="0: sin opción de seña." value={v.depositPercent} onChange={num('depositPercent')} />
      <Field label="Cancelación sin cargo (horas antes)" name="cancelHours" type="number" min={0} max={720} value={v.cancelHours} onChange={num('cancelHours')} />
      <Field label="Retención para pagar (minutos)" name="holdMinutes" type="number" min={2} max={60} value={v.holdMinutes} onChange={num('holdMinutes')} />
      <label className="check-row">
        <input type="checkbox" checked={v.payAtClub} onChange={(e) => setV({ ...v, payAtClub: e.target.checked })} />
        Permitir pagar en el club
      </label>
      <label className="check-row">
        <input type="checkbox" checked={v.publicBooking} onChange={(e) => setV({ ...v, publicBooking: e.target.checked })} />
        Reserva sin cuenta (público, tarifa general y pago online)
      </label>
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Guardar reglas
          </Button>
        </div>
      </div>
    </form>
  );
}

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function TariffForm({ venueId, venueName }: { venueId: string; venueName: string }) {
  const router = useRouter();
  const [v, setV] = useState({ label: '', from: '08:00', to: '23:00', member: '', guest: '', days: 127 });
  const [msg, setMsg] = useState<Msg>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const memberPrice = parseMoney(v.member);
    const guestPrice = parseMoney(v.guest);
    if (memberPrice === null || guestPrice === null) return setMsg({ tone: 'bad', text: 'Revisá los precios.' });
    const r = await postJson(`/api/m/facilities/venues/${venueId}/tariffs`, { label: v.label, days: v.days, fromMinute: toMin(v.from), toMinute: v.to === '00:00' ? 1440 : toMin(v.to), memberPrice, guestPrice });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: 'Tarifa agregada.' });
    setV({ ...v, label: '', member: '', guest: '' });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label={`Nueva tarifa de ${venueName}`}>
      <Field label="Nombre de la franja" name="label" required maxLength={40} placeholder="Tarde y noche" value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
      <fieldset className="day-picks">
        <legend className="cx-label">Días</legend>
        {DAYS.map((d, i) => (
          <label key={d} className="day-pick">
            <input type="checkbox" checked={(v.days & (1 << i)) !== 0} onChange={(e) => setV({ ...v, days: e.target.checked ? v.days | (1 << i) : v.days & ~(1 << i) })} aria-label={['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][i]} />
            {d}
          </label>
        ))}
      </fieldset>
      <Field label="Desde" name="tfrom" type="time" value={v.from} onChange={(e) => setV({ ...v, from: e.target.value })} />
      <Field label="Hasta" name="tto" type="time" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} />
      <Field label="Precio socio ($)" name="member" inputMode="decimal" required value={v.member} onChange={(e) => setV({ ...v, member: e.target.value })} />
      <Field label="Precio no socio ($)" name="guest" inputMode="decimal" required value={v.guest} onChange={(e) => setV({ ...v, guest: e.target.value })} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" variant="secondary">
            Agregar tarifa
          </Button>
        </div>
      </div>
    </form>
  );
}

export function RemoveTariff({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="cx-link-button"
      aria-label={`Quitar tarifa: ${label}`}
      onClick={async () => {
        if ((await send('DELETE', `/api/m/facilities/tariffs/${id}`)).ok) router.refresh();
      }}
    >
      Quitar
    </button>
  );
}
