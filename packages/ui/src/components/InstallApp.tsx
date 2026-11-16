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

  useEffect(() => {
    // Registro diferido: solo si nadie lo registró todavía y con la página ya cargada, para no
    // competir con la navegación en curso.
    let idle: ReturnType<typeof setTimeout> | undefined;
    if (serviceWorkerUrl && 'serviceWorker' in navigator) {
      idle = setTimeout(async () => {
        if (!(await navigator.serviceWorker.getRegistration('/'))) await navigator.serviceWorker.register(serviceWorkerUrl, { scope: '/' }).catch(() => undefined);
      }, 1500);
    }
    const update = () => setMode(detect());
    const installed = () => setMode('hidden');
    update();
    window.addEventListener('clumera:installable', update);
    window.addEventListener('appinstalled', installed);
    return () => {
      clearTimeout(idle);
      window.removeEventListener('clumera:installable', update);
      window.removeEventListener('appinstalled', installed);
    };
  }, [serviceWorkerUrl]);

  if (mode === 'hidden') return null;

  async function install() {
    const prompt = window.__clumeraInstall;
    if (!prompt) return setHelp((h) => !h);
    window.__clumeraInstall = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setMode(outcome === 'accepted' ? 'hidden' : detect());
  }

  return (
    <div className={className} data-install-mode={mode}>
      <Button variant={variant} onClick={install} aria-expanded={mode === 'prompt' ? undefined : help}>
        Instalar app
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
