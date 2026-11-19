'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AVAILABILITY_LABEL, STATUS_LABEL } from '@/lib/health-labels';
import { postJson } from './forms';

const CONTEXTS = ['Partido', 'Entrenamiento', 'Fuera del club'];
const IMPACTS = ['Puedo entrenar con molestia', 'Limita algunos ejercicios', 'No puedo entrenar'];

/** La persona o su responsable informa una lesión o molestia. Va solo a Médico/Kine. */
export function InjuryReportForm({ options }: { options: Array<{ personId: string; teamId: string; label: string }> }) {
  const router = useRouter();
  const [target, setTarget] = useState(options[0] ? `${options[0].personId}|${options[0].teamId}` : '');
  const [zone, setZone] = useState('');
  const [pain, setPain] = useState(3);
  const [context, setContext] = useState(CONTEXTS[1]!);
  const [impact, setImpact] = useState(IMPACTS[0]!);
  const [onset, setOnset] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const [personId, teamId] = target.split('|');
    setBusy(true);
    const r = await postJson('/api/sports/injuries', { personId, teamId, zone, pain, context, impact, onsetDate: onset, notes });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: 'Reporte enviado a Médico/Kine. El coach solo verá la disponibilidad.' });
    setZone('');
    setNotes('');
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Informar lesión">
      {options.length > 1 ? (
        <div className="cx-field span-2">
          <label className="cx-label" htmlFor="inj-target">
            Quién y en qué equipo
          </label>
          <select id="inj-target" className="cx-select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {options.map((o) => (
              <option key={`${o.personId}|${o.teamId}`} value={`${o.personId}|${o.teamId}`}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Field label="Zona" name="zone" required minLength={2} maxLength={80} placeholder="Tobillo derecho, rodilla…" value={zone} onChange={(e) => setZone(e.target.value)} />
      <Field label="Desde" name="onset" type="date" required max={new Date().toISOString().slice(0, 10)} value={onset} onChange={(e) => setOnset(e.target.value)} />
      <div className="cx-field">
        <label className="cx-label" htmlFor="inj-pain">
          Dolor: {pain} de 10
        </label>
        <input id="inj-pain" type="range" min={0} max={10} step={1} value={pain} onChange={(e) => setPain(Number(e.target.value))} style={{ minHeight: 44 }} />
      </div>
      <div className="cx-field">
        <label className="cx-label" htmlFor="inj-context">
          Dónde pasó
        </label>
        <select id="inj-context" className="cx-select" value={context} onChange={(e) => setContext(e.target.value)}>
          {CONTEXTS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="cx-field span-2">
        <label className="cx-label" htmlFor="inj-impact">
          Cuánto limita
        </label>
        <select id="inj-impact" className="cx-select" value={impact} onChange={(e) => setImpact(e.target.value)}>
          {IMPACTS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="cx-field span-2">
        <label className="cx-label" htmlFor="inj-notes">
          Comentario (opcional)
        </label>
        <textarea id="inj-notes" className="cx-input" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" disabled={busy || !target}>
            Enviar a Médico/Kine
          </Button>
        </div>
      </div>
    </form>
  );
}

/** Evaluación de Médico/Kine: estado, disponibilidad deportiva, nota para la familia y nota privada. */
export function EvaluationForm({ reportId, status, availability, publicNote }: { reportId: string; status: string; availability: string; publicNote: string }) {
  const router = useRouter();
  const [s, setS] = useState(status === 'evaluation' ? 'follow_up' : status);
  const [a, setA] = useState(availability);
  const [pub, setPub] = useState(publicNote);
  const [priv, setPriv] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const r = await postJson(`/api/sports/injuries/${reportId}/evaluations`, { status: s, availability: a, publicNote: pub, privateNote: priv });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setMsg({ tone: 'ok', text: 'Evaluación guardada. Se avisó a la persona sin detalles clínicos.' });
    setPriv('');
    router.refresh();
  }
  return (
    <form className="form-grid" onSubmit={submit} aria-label="Nueva evaluación">
      <div className="cx-field">
        <label className="cx-label" htmlFor="ev-status">
          Estado
        </label>
        <select id="ev-status" className="cx-select" value={s} onChange={(e) => setS(e.target.value)}>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="cx-field">
        <label className="cx-label" htmlFor="ev-av">
          Disponibilidad deportiva
        </label>
        <select id="ev-av" className="cx-select" value={a} onChange={(e) => setA(e.target.value)}>
          {Object.entries(AVAILABILITY_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="cx-field span-2">
        <label className="cx-label" htmlFor="ev-pub">
          Indicaciones para la persona y su familia
        </label>
        <textarea id="ev-pub" className="cx-input" rows={3} maxLength={2000} value={pub} onChange={(e) => setPub(e.target.value)} />
      </div>
      <div className="cx-field span-2">
        <label className="cx-label" htmlFor="ev-priv">
          Nota clínica privada (solo Médico/Kine)
        </label>
        <textarea id="ev-priv" className="cx-input" rows={3} maxLength={2000} value={priv} onChange={(e) => setPriv(e.target.value)} />
      </div>
      <div className="span-2 cx-stack">
        {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
        <div>
          <Button type="submit" disabled={busy}>
            Guardar evaluación
          </Button>
        </div>
      </div>
    </form>
  );
}
