'use client';

import { useEffect, useState } from 'react';
import { Button } from './Button';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __clumeraInstall?: InstallPromptEvent | null;
  }
}

type Mode = 'hidden' | 'prompt' | 'ios' | 'manual';

function detect(): Mode {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return 'hidden';
  if (window.__clumeraInstall) return 'prompt';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'manual';
}

function waitForPrompt(ms: number): Promise<InstallPromptEvent | null> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener('clumera:installable', done);
      resolve(window.__clumeraInstall ?? null);
    };
    const timer = setTimeout(done, ms);
    window.addEventListener('clumera:installable', done);
  });
}

export interface InstallAppProps {
  /** Nombre de la app tal como queda bajo el ícono. */
  appName: string;
  /** Registra el service worker si la página no lo hace (Lab). */
  serviceWorkerUrl?: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}

/**
 * Botón «Instalar app». En Chrome y Android abre el aviso nativo; en iPhone y iPad (que no tienen
 * aviso) muestra los pasos de Safari; en otros navegadores, dónde está la opción en el menú.
 * Ya instalada —abierta desde el ícono— no se muestra.
 */
export function InstallApp({ appName, serviceWorkerUrl, variant = 'primary', className }: InstallAppProps) {
  const [mode, setMode] = useState<Mode>('hidden');
  const [help, setHelp] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    // Registro con la página ya cargada (no compite con la navegación) y solo si falta: Chrome
    // ofrece instalar recién cuando hay service worker. Mismas opciones que el core (Serwist usa
    // workers de módulo): si difieren, el navegador lo reinstala en medio de una navegación.
    const registerWorker = async () => {
      if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register(serviceWorkerUrl!, { scope: '/', type: 'module' }).catch(() => undefined);
    };
    const wantsWorker = Boolean(serviceWorkerUrl) && 'serviceWorker' in navigator;
    if (wantsWorker) {
      if (document.readyState === 'complete') void registerWorker();
      else window.addEventListener('load', registerWorker, { once: true });
    }
    const update = () => setMode(detect());
    const installed = () => setMode('hidden');
    update();
    window.addEventListener('clumera:installable', update);
    window.addEventListener('appinstalled', installed);
    return () => {
      if (wantsWorker) window.removeEventListener('load', registerWorker);
      window.removeEventListener('clumera:installable', update);
      window.removeEventListener('appinstalled', installed);
    };
  }, [serviceWorkerUrl]);

  if (mode === 'hidden') return null;

  async function install() {
    if (help) return setHelp(false);
    // Chrome puede tardar unos segundos en ofrecer la instalación (registra el service worker
    // primero): se espera al aviso nativo antes de mostrar los pasos.
    let prompt = window.__clumeraInstall ?? null;
    if (!prompt && mode !== 'ios') {
      setWaiting(true);
      prompt = await waitForPrompt(3000);
      setWaiting(false);
    }
    if (!prompt) return setHelp(true);
    window.__clumeraInstall = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setMode(outcome === 'accepted' ? 'hidden' : detect());
  }

  return (
    <div className={className} data-install-mode={mode}>
      <Button variant={variant} onClick={install} disabled={waiting} aria-expanded={mode === 'prompt' ? undefined : help}>
        {waiting ? 'Preparando…' : 'Instalar app'}
      </Button>
      {help ? (
        <div className="cx-install-help" role="region" aria-label="Cómo instalar la app">
          {mode === 'ios' ? (
            <ol>
              <li>
                Abrí esta página en <strong>Safari</strong>.
              </li>
              <li>
                Tocá <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba).
              </li>
              <li>
                Elegí <strong>Agregar a inicio</strong> y confirmá con <strong>Agregar</strong>.
              </li>
              <li>Abrí {appName} desde el ícono nuevo: ahí podés activar los avisos.</li>
            </ol>
          ) : (
            <ol>
              <li>
                Abrí el menú del navegador (<strong>⋮</strong> o <strong>…</strong>).
              </li>
              <li>
                Elegí <strong>Instalar app</strong> o <strong>Agregar a la pantalla principal</strong>.
              </li>
              <li>Si no aparece, abrí esta página en Chrome, Edge o Safari.</li>
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
