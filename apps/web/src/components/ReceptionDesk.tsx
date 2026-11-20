'use client';

import { Button, Notice } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { postJson } from './forms';

interface CheckView {
  attemptId: string;
  granted: boolean;
  reason: string | null;
  detail: string;
  person: { firstName: string; lastName: string } | null;
  canOverride: boolean;
}

type Found = { id: string; name: string; memberNumber: string | null };

// Detector de códigos del navegador (Chrome en Android y escritorio). Donde no existe, Recepción
// tipea el código o usa un lector USB, que escribe como un teclado y termina con Enter.
type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
const BarcodeDetectorCtor = () => (typeof window !== 'undefined' ? (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector : undefined);

const initials = (p: { firstName: string; lastName: string }) => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`.toUpperCase();

/**
 * Puesto de Recepción: cámara (si el navegador la soporta), código tipeado o de un lector, y búsqueda
 * por persona. Muestra validez, motivo y nombre; ante un rechazo, «Excepción autorizada» con motivo.
 */
export function ReceptionDesk({ pointId, canOverride }: { pointId: string; canOverride: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [result, setResult] = useState<CheckView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [camera, setCamera] = useState<'off' | 'on' | 'unsupported'>('off');
  const video = useRef<HTMLVideoElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const last = useRef({ token: '', at: 0 });

  async function check(body: { token?: string; personId?: string }) {
    setBusy(true);
    setError('');
    setWhy(null);
    const r = await postJson<CheckView>('/api/m/access/check', { pointId, ...body });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setResult(r.data);
    setCode('');
    setFound(null);
    router.refresh();
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (code.trim()) await check({ token: code.trim() });
  }

  async function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (q.trim().length < 2) return;
    setError('');
    try {
      const res = await fetch(`/api/m/access/people?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
      const body = (await res.json()) as { items?: Found[]; error?: { message: string } };
      if (!res.ok) return setError(body.error?.message ?? 'No se pudo buscar');
      setFound(body.items ?? []);
    } catch {
      setError('No hay conexión. Probá de nuevo.');
    }
  }

  async function override(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!result || why === null) return;
    setBusy(true);
    const r = await postJson<CheckView>(`/api/m/access/attempts/${result.attemptId}/override`, { reason: why });
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    setWhy(null);
    setResult(r.data);
    router.refresh();
  }

  function next() {
    setResult(null);
    setWhy(null);
    setError('');
    codeInput.current?.focus();
  }

  // Cámara: busca un QR cada 300 ms; el mismo código no se valida dos veces seguidas en 5 s.
  useEffect(() => {
    if (camera !== 'on') return;
    const Ctor = BarcodeDetectorCtor();
    if (!Ctor) return setCamera('unsupported');
    const detector = new Ctor({ formats: ['qr_code'] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const token = codes[0]?.rawValue;
          if (!token || (token === last.current.token && Date.now() - last.current.at < 5000)) return;
          last.current = { token, at: Date.now() };
          void check({ token });
        }, 300);
      })
      .catch(() => setCamera('unsupported'));
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // `check` depende del punto, que no cambia sin recargar la página.
  }, [camera]);

  return (
    <div className="cx-stack reception__main">
      <div className="reception__cam">
        {camera === 'on' ? (
          <video ref={video} muted playsInline aria-label="Cámara para escanear el QR" />
        ) : (
          <div className="reception__cam-off">
            <p>{camera === 'unsupported' ? 'Este navegador no puede leer QR con la cámara: tipeá el código o usá un lector.' : 'Apuntá al QR del carnet, pase o reserva.'}</p>
            {camera === 'off' ? (
              <Button variant="secondary" onClick={() => setCamera('on')}>
                Activar cámara
              </Button>
            ) : null}
          </div>
        )}
        {camera === 'on' ? <span className="reception__frame" aria-hidden="true" /> : null}
      </div>

      <form className="search-row" onSubmit={onCode} aria-label="Validar código">
        <input ref={codeInput} className="cx-input" name="token" autoComplete="off" autoFocus aria-label="Código del QR" placeholder="Código del QR o lector" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button type="submit" disabled={busy || !code.trim()}>
          Validar
        </Button>
      </form>

      {result ? (
        <section className={`access-result access-result--${result.granted ? 'ok' : 'no'}`} aria-live="polite" aria-label="Resultado">
          <p className="access-result__big">{result.granted ? '✓ INGRESO PERMITIDO' : '✕ INGRESO DENEGADO'}</p>
          <div className="access-result__who">
            {result.person ? (
              <span className="access-result__avatar" aria-hidden="true">
                {initials(result.person)}
              </span>
            ) : null}
            <div>
              {result.person ? (
                <strong className="access-result__name">
                  {result.person.firstName} {result.person.lastName}
                </strong>
              ) : null}
              <span className="access-result__detail">{result.detail}</span>
            </div>
          </div>
          {!result.granted ? <p className="access-result__note">Derivar a Secretaría. No se muestran deudas ni datos de salud.</p> : null}
          {why !== null ? (
            <form className="cx-stack" onSubmit={override} aria-label="Excepción autorizada">
              <label className="cx-label" htmlFor="override-why">
                Motivo de la excepción
              </label>
              <input id="override-why" className="cx-input" required minLength={5} maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Quién la autoriza y por qué" />
              <div className="adm-actions">
                <Button type="submit" disabled={busy || why.trim().length < 5}>
                  Autorizar ingreso
                </Button>
                <Button variant="secondary" onClick={() => setWhy(null)}>
                  Volver
                </Button>
              </div>
            </form>
          ) : (
            <div className="adm-actions">
              {!result.granted && result.canOverride && canOverride ? (
                <Button variant="secondary" onClick={() => setWhy('')}>
                  Excepción autorizada
                </Button>
              ) : null}
              <Button variant={result.granted ? 'primary' : 'secondary'} onClick={next}>
                Siguiente
              </Button>
            </div>
          )}
        </section>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}

      <form className="search-row" role="search" onSubmit={onSearch} aria-label="Buscar persona">
        <input className="cx-input" type="search" aria-label="Buscar persona" placeholder="Nombre, DNI o N° de socio" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      {found ? (
        <div className="rows" aria-label="Personas encontradas">
          {found.map((p) => (
            <div key={p.id}>
              <span className="grow">
                {p.name}
                <span className="cx-muted" style={{ display: 'block' }}>
                  {p.memberNumber ? `N° ${p.memberNumber}` : 'No socio'}
                </span>
              </span>
              <Button variant="secondary" onClick={() => check({ personId: p.id })} aria-label={`Validar a ${p.name}`}>
                Validar
              </Button>
            </div>
          ))}
          {found.length === 0 ? <p className="cx-muted">Sin resultados.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
