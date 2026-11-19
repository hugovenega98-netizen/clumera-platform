'use client';

import { Button, Field, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { postJson } from './forms';

/** Transmisión embebida (YouTube sin cookies). Solo un id validado en el servidor. */
export function StreamEmbed({ videoId, title }: { videoId: string; title: string }) {
  return (
    <div className="stream">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`}
        title={`Transmisión · ${title}`}
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}

/** «Seguir partido»: avisos push por cada incidencia. */
export function FollowToggle({ matchId, following }: { matchId: string; following: boolean }) {
  const [on, setOn] = useState(following);
  const [error, setError] = useState('');
  async function toggle() {
    setError('');
    const r = await postJson(`/api/sports/matches/${matchId}/follow`, { follow: !on });
    if (!r.ok) return setError(r.error.message);
    setOn(!on);
  }
  return (
    <div className="cx-stack" style={{ gap: 'var(--cx-space-2)' }}>
      <Button variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={toggle}>
        {on ? 'Siguiendo · avisos activos' : 'Seguir partido'}
      </Button>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}

/** Canje de un código de invitado para ver el minuto a minuto sin cuenta. */
export function GuestCodeForm({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const r = await postJson('/api/sports/guest', { matchId, code });
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }
  return (
    <form className="cx-stack" onSubmit={submit} aria-label="Código de invitado">
      <Field label="Código de invitado" name="code" required autoComplete="off" autoCapitalize="characters" placeholder="INV-…" value={code} onChange={(e) => setCode(e.target.value)} />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      <Button type="submit" block>
        Ver el partido
      </Button>
    </form>
  );
}

/** Coach: transmisión y pases de invitado. */
export function CoachMatchExtras({ matchId, streamVideoId, locked }: { matchId: string; streamVideoId: string | null; locked: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(streamVideoId ? `https://youtu.be/${streamVideoId}` : '');
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  async function saveStream(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await postJson(`/api/sports/matches/${matchId}/stream`, { url: url.trim() || null });
    setMsg(r.ok ? { tone: 'ok', text: url.trim() ? 'Transmisión guardada.' : 'Transmisión quitada.' } : { tone: 'bad', text: r.error.message });
    if (r.ok) router.refresh();
  }
  async function newPass() {
    const r = await postJson<{ code: string }>(`/api/sports/matches/${matchId}/guest-passes`, {});
    if (!r.ok) return setMsg({ tone: 'bad', text: r.error.message });
    setCode(r.data.code);
    setMsg(null);
  }
  async function revoke() {
    const res = await fetch(`/api/sports/matches/${matchId}/guest-passes`, { method: 'DELETE' }).catch(() => null);
    setCode(null);
    setMsg(res?.ok ? { tone: 'ok', text: 'Pases revocados: los invitados dejan de ver el partido.' } : { tone: 'bad', text: 'No se pudo revocar.' });
  }
  return (
    <div className="cx-stack">
      <form className="cx-stack" onSubmit={saveStream} aria-label="Transmisión">
        <Field label="Transmisión de YouTube" name="stream" placeholder="https://youtube.com/live/…" hint="Se ve en el minuto a minuto. Vacío la quita." value={url} onChange={(e) => setUrl(e.target.value)} />
        <div>
          <Button type="submit" variant="secondary">
            Guardar transmisión
          </Button>
        </div>
      </form>
      {locked ? null : (
        <div className="cx-stack" aria-label="Pases de invitado" role="group">
          <p className="cx-muted">Pase de invitado: un código para que alguien sin cuenta siga este partido. Vale 12 horas o hasta el final.</p>
          {code ? (
            <Notice tone="ok">
              Código: <strong data-testid="guest-code">{code}</strong> — copialo ahora, no se vuelve a mostrar.
            </Notice>
          ) : null}
          <div className="adm-actions">
            <Button variant="secondary" onClick={newPass}>
              Generar código
            </Button>
            <Button variant="danger" onClick={revoke}>
              Revocar pases
            </Button>
          </div>
        </div>
      )}
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </div>
  );
}

/** Planilla transitoria: jugadores de un solo partido (coach o mesa). */
export function TemporaryPlayers({ matchId, players, locked }: { matchId: string; players: Array<{ id: string; name: string; number: number | null }>; locked: boolean }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [error, setError] = useState('');
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const r = await postJson(`/api/sports/matches/${matchId}/temporary-players`, { name, number: number ? Number(number) : null });
    if (!r.ok) return setError(r.error.message);
    setName('');
    setNumber('');
    router.refresh();
  }
  async function remove(id: string) {
    const res = await fetch(`/api/sports/temporary-players/${id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) setError(((await res?.json().catch(() => ({}))) as { error?: { message?: string } })?.error?.message ?? 'No se pudo quitar.');
    router.refresh();
  }
  return (
    <div className="cx-stack">
      {players.length ? (
        <div className="rows">
          {players.map((p) => (
            <div key={p.id}>
              <span className="grow">
                {p.name}
                {p.number != null ? ` · ${p.number}` : ''}
              </span>
              {locked ? null : (
                <button type="button" className="cx-link-button" onClick={() => remove(p.id)}>
                  Quitar
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="cx-muted">Nadie fuera del plantel.</p>
      )}
      {locked ? null : (
        <form className="form-grid" onSubmit={add} aria-label="Sumar a la planilla">
          <Field label="Nombre" name="tname" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Dorsal" name="tnumber" type="number" min={0} max={999} inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
          <div className="span-2 cx-stack">
            {error ? <Notice tone="bad">{error}</Notice> : null}
            <div>
              <Button type="submit" variant="secondary">
                Sumar a la planilla
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
