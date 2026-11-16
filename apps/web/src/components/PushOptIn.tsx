'use client';

import { Button, Card, Notice } from '@clumera/ui';
import { useEffect, useState } from 'react';

type State =
  | { kind: 'checking' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'ready' }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIosOutsideHomeScreen(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

/**
 * Activa avisos en este dispositivo y manda un push de prueba (Fase 0: push de punta a punta).
 * En iPhone los avisos solo funcionan con la app agregada a la pantalla de inicio.
 */
export function PushOptIn({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>({ kind: 'checking' });

  useEffect(() => {
    if (!vapidPublicKey) return setState({ kind: 'unsupported', reason: 'Los avisos todavía no están configurados en este club.' });
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return setState({
        kind: 'unsupported',
        reason: isIosOutsideHomeScreen()
          ? 'En iPhone, agregá la app a la pantalla de inicio (Compartir → Agregar a inicio) y abrila desde ahí para recibir avisos.'
          : 'Este navegador no admite avisos.',
      });
    }
    setState({ kind: 'ready' });
  }, [vapidPublicKey]);

  async function enable() {
    setState({ kind: 'working' });
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState({ kind: 'error', message: 'No diste permiso para mostrar avisos.' });
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        return setState({ kind: 'error', message: body?.error?.message ?? `No se pudo enviar el aviso (HTTP ${res.status}).` });
      }
      setState({ kind: 'done' });
    } catch (e) {
      setState({ kind: 'error', message: (e as Error).message || 'No se pudieron activar los avisos.' });
    }
  }

  return (
    <Card title="Avisos en este dispositivo">
      {state.kind === 'unsupported' ? <Notice tone="warn">{state.reason}</Notice> : null}
      {state.kind === 'error' ? <Notice tone="bad">{state.message}</Notice> : null}
      {state.kind === 'done' ? <Notice tone="ok">Listo: te mandamos un aviso de prueba.</Notice> : null}
      {state.kind === 'ready' || state.kind === 'working' || state.kind === 'error' ? (
        <Button onClick={enable} disabled={state.kind === 'working'} block>
          {state.kind === 'working' ? 'Activando…' : 'Activar avisos y probar'}
        </Button>
      ) : null}
    </Card>
  );
}
