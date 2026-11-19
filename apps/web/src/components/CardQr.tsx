'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

interface CardResponse {
  qr: { token: string; expiresAt: string } | null;
}

/**
 * QR del carnet. Pide un código nuevo apenas vence el anterior (ventanas de 30 s), así una captura
 * de pantalla no sirve. Si no hay conexión, avisa en vez de mostrar un código vencido.
 */
export function CardQr({ personId, initial }: { personId: string; initial: { token: string; expiresAt: string } }) {
  const [qr, setQr] = useState(initial);
  const [svg, setSvg] = useState('');
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(qr.token, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0e2238', light: '#ffffff' } }).then((s) => {
      if (!cancelled) setSvg(s);
    });
    const wait = Math.max(1000, new Date(qr.expiresAt).getTime() - Date.now() + 500);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/identity/card?persona=${encodeURIComponent(personId)}`, { cache: 'no-store' });
        const body = (await res.json()) as CardResponse;
        if (!cancelled && body.qr) {
          setOffline(false);
          setQr(body.qr);
        }
      } catch {
        if (!cancelled) setOffline(true);
      }
    }, wait);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [qr, personId]);

  return (
    <div className="credential__qr">
      <div role="img" aria-label="Código QR de acceso" data-token={qr.token} dangerouslySetInnerHTML={{ __html: svg }} />
      {offline ? <strong style={{ color: 'var(--cx-bad)' }}>Sin conexión: el código venció. Conectate para renovarlo.</strong> : <span>Se renueva cada 30 s · no contiene datos personales</span>}
    </div>
  );
}
