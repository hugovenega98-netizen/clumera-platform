'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

/** Inscribir a una persona en un grupo. Sin lugar, queda en espera (y se avisa). */
export function EnrollButton({ groupId, personId, who, waitlist }: { groupId: string; personId: string; who: string; waitlist: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function go() {
    setBusy(true);
    setMsg(null);
    const r = await postJson<{ status: string; waitPosition: number | null }>('/api/m/schools/enrollments', { groupId, personId });
    if (r.ok) return router.refresh();
    setBusy(false);
    setMsg({ tone: 'bad', text: r.error.message });
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)', alignItems: 'flex-end' }}>
      <Button variant={waitlist ? 'secondary' : 'primary'} onClick={go} disabled={busy} aria-label={`${waitlist ? 'Anotar en espera' : 'Inscribir'} a ${who}`}>
        {busy ? 'Guardando…' : waitlist ? 'Anotar en espera' : 'Inscribir'}
      </Button>
      {msg ? <Notice tone="bad">{msg.text}</Notice> : null}
    </div>
  );
}

/** Baja con motivo. Si liberaba un lugar, el primero en espera queda inscripto. */
export function WithdrawEnrollment({ id, title, waiting }: { id: string; title: string; waiting: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson(`/api/m/schools/enrollments/${id}/withdraw`, { reason });
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }
  if (!open)
    return (
      <div>
        <Button variant="secondary" onClick={() => setOpen(true)} aria-label={`${waiting ? 'Salir de la espera' : 'Dar de baja'}: ${title}`}>
          {waiting ? 'Salir de la espera' : 'Dar de baja'}
        </Button>
      </div>
    );
  return (
    <form className="cx-stack" onSubmit={submit} aria-label={`Baja: ${title}`}>
      <Field label="Motivo" name="reason" required minLength={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} hint={waiting ? undefined : 'Si la cuota del mes no está paga, se anula.'} />
      <div className="adm-actions">
        <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>
          Confirmar baja
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Volver
        </Button>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </form>
  );
}

type Mark = 'present' | 'absent' | 'late';
const MARKS: Array<{ key: Mark; short: string; label: string }> = [
  { key: 'present', short: 'P', label: 'Presente' },
  { key: 'absent', short: 'A', label: 'Ausente' },
  { key: 'late', short: 'T', label: 'Tarde' },
];

/** Asistencia del día (lienzo «Profesor · asistencia del grupo»): P / A / T por persona y guardar. */
export function AttendanceSheet({ groupId, day, people, saved }: { groupId: string; day: string; people: Array<{ id: string; firstName: string; lastName: string; mark: Mark | null }>; saved: boolean }) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Mark>>(() => Object.fromEntries(people.map((p) => [p.id, p.mark ?? 'present'])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(saved ? { tone: 'ok', text: 'La asistencia de hoy ya está guardada. Podés corregirla.' } : null);
  const count = (m: Mark) => Object.values(marks).filter((x) => x === m).length;
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await postJson(`/api/m/schools/groups/${groupId}/attendance`, { day, marks: people.map((p) => ({ personId: p.id, mark: marks[p.id] })) });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: `Asistencia guardada: ${count('present')} presentes, ${count('absent')} ausentes, ${count('late')} tarde.` });
    router.refresh();
  }
  if (!people.length) return <p className="cx-muted">Este grupo todavía no tiene inscriptos confirmados.</p>;
  return (
    <div className="cx-stack">
      <div className="attendance-counts">
        {MARKS.map((m) => (
          <div key={m.key} className="kpi">
            <span className="cx-muted">{m.key === 'present' ? 'Presentes' : m.key === 'absent' ? 'Ausentes' : 'Tarde'}</span>
            <b>{count(m.key)}</b>
          </div>
        ))}
      </div>
      <ul className="attendance-list" aria-label="Lista del grupo">
        {people.map((p) => (
          <li key={p.id}>
            <span className="enroll-row__avatar" aria-hidden="true">
              {`${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase()}
            </span>
            <span className="grow">
              {p.firstName} {p.lastName}
            </span>
            <span className="attendance-marks" role="group" aria-label={`Asistencia de ${p.firstName} ${p.lastName}`}>
              {MARKS.map((m) => (
                <button key={m.key} type="button" className={`attendance-mark attendance-mark--${m.key}`} aria-pressed={marks[p.id] === m.key} aria-label={m.label} onClick={() => setMarks({ ...marks, [p.id]: m.key })}>
                  {m.short}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {msg ? (
        <p className={`callup-status callup-status--${msg.tone === 'ok' ? 'ok' : 'bad'}`} role="status">
          {msg.text}
        </p>
      ) : null}
      <div>
        <Button onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar asistencia'}
        </Button>
      </div>
    </div>
  );
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Coordinación: nueva propuesta (montos en pesos; se guardan en centavos). */
export function NewProgramForm() {
  const router = useRouter();
  const [v, setV] = useState({ slug: '', name: '', activity: '', minAge: '', maxAge: '', memberFee: '', guestFee: '', membersOnly: false });
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const num = (s: string) => (s.trim() === '' ? null : Number(s));
    const r = await postJson('/api/m/schools/programs', {
      slug: v.slug.trim(),
      name: v.name.trim(),
      activity: (v.activity || v.slug).trim(),
      minAge: num(v.minAge),
      maxAge: num(v.maxAge),
      membersOnly: v.membersOnly,
      memberFee: Math.round(Number(v.memberFee || 0) * 100),
      guestFee: Math.round(Number(v.guestFee || 0) * 100),
    });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: 'Propuesta creada. Ahora sumale grupos.' });
    setV({ slug: '', name: '', activity: '', minAge: '', maxAge: '', memberFee: '', guestFee: '', membersOnly: false });
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nueva propuesta">
      <Field label="Nombre" name="name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      <Field label="Identificador" name="slug" required hint="Minúsculas y guiones: natacion-infantil" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />
      <Field label="Actividad (profesores)" name="activity" hint="Ámbito del rol Profesor. Vacío: el identificador." value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })} />
      <div className="form-grid__pair">
        <Field label="Edad mínima" name="minAge" type="number" inputMode="numeric" min={0} max={99} value={v.minAge} onChange={(e) => setV({ ...v, minAge: e.target.value })} />
        <Field label="Edad máxima" name="maxAge" type="number" inputMode="numeric" min={0} max={99} value={v.maxAge} onChange={(e) => setV({ ...v, maxAge: e.target.value })} />
      </div>
      <Field label="Cuota socio ($ por mes)" name="memberFee" type="number" inputMode="decimal" min={0} required value={v.memberFee} onChange={(e) => setV({ ...v, memberFee: e.target.value })} />
      <Field label="Cuota general ($ por mes)" name="guestFee" type="number" inputMode="decimal" min={0} required value={v.guestFee} onChange={(e) => setV({ ...v, guestFee: e.target.value })} />
      <label className="check-row span-2">
        <input type="checkbox" checked={v.membersOnly} onChange={(e) => setV({ ...v, membersOnly: e.target.checked })} />
        Solo para socios
      </label>
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit">Crear propuesta</Button>
        </div>
      </div>
    </form>
  );
}

/** Coordinación: nuevo grupo de una propuesta. */
export function NewGroupForm({ programId, programName }: { programId: string; programName: string }) {
  const router = useRouter();
  const [v, setV] = useState({ name: '', time: '18:00', duration: '60', capacity: '20', place: '', teacherName: '' });
  const [days, setDays] = useState<number>(0);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!days) return setMsg({ tone: 'bad', text: 'Elegí al menos un día.' });
    const r = await postJson(`/api/m/schools/programs/${programId}/groups`, { name: v.name, days, time: v.time, durationMinutes: Number(v.duration), capacity: Number(v.capacity), place: v.place || undefined, teacherName: v.teacherName || undefined });
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: 'Grupo creado.' });
    setV({ ...v, name: '' });
    setDays(0);
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label={`Nuevo grupo de ${programName}`}>
      <Field label="Nombre del grupo" name="name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Sub 10 · tarde" />
      <fieldset className="span-2 day-picker">
        <legend className="cx-label">Días</legend>
        {DAY_NAMES.map((d, i) => (
          <label key={d} className="chip chip--small">
            <input type="checkbox" checked={Boolean(days & (1 << i))} onChange={() => setDays(days ^ (1 << i))} />
            {d}
          </label>
        ))}
      </fieldset>
      <Field label="Hora" name="time" type="time" required value={v.time} onChange={(e) => setV({ ...v, time: e.target.value })} />
      <Field label="Duración (min)" name="duration" type="number" min={15} max={720} required value={v.duration} onChange={(e) => setV({ ...v, duration: e.target.value })} />
      <Field label="Cupo" name="capacity" type="number" min={1} max={500} required value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value })} />
      <Field label="Lugar" name="place" value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} />
      <Field label="Profesor" name="teacherName" value={v.teacherName} onChange={(e) => setV({ ...v, teacherName: e.target.value })} />
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit">Crear grupo</Button>
        </div>
      </div>
    </form>
  );
}

/** Coordinación: emitir las cuotas de un mes (idempotente: no duplica). */
export function IssueFees({ period, label }: { period: string; label: string }) {
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await postJson<{ issued: number; existing: number }>('/api/m/schools/fees', { period });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: r.data.issued ? `Se emitieron ${r.data.issued} cuotas de ${label}.` : `Las cuotas de ${label} ya estaban emitidas (${r.data.existing}).` });
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <div>
        <Button variant="secondary" onClick={go} disabled={busy}>
          {busy ? 'Emitiendo…' : `Emitir cuotas de ${label}`}
        </Button>
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </div>
  );
}
