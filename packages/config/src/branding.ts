import type { ClientConfig } from './schema';

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Variables `--client-*` que consume packages/ui. Ningún componente fija colores de un club. */
export function clientCssVariables(cfg: ClientConfig): Record<`--client-${string}`, string> {
  const vars: Record<`--client-${string}`, string> = {};
  for (const [key, value] of Object.entries(cfg.colors)) vars[`--client-${kebab(key)}`] = value;
  return vars;
}

export function clientCssText(cfg: ClientConfig): string {
  const body = Object.entries(clientCssVariables(cfg))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `:root{${body}}`;
}

/** Origen público de la instalación: dominio propio si lo contrató, si no el subdominio básico. */
export function publicOrigin(cfg: ClientConfig): string {
  return `https://${cfg.domain.customDomain ?? `${cfg.domain.subdomain}.clumera.app`}`;
}

export interface WebAppManifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  start_url: string;
  scope: string;
  display: 'standalone';
  orientation: 'portrait-primary';
  background_color: string;
  theme_color: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: 'any' | 'maskable' }>;
}

const mime = (src: string) => (src.endsWith('.svg') ? 'image/svg+xml' : src.endsWith('.webp') ? 'image/webp' : src.endsWith('.jpg') || src.endsWith('.jpeg') ? 'image/jpeg' : 'image/png');

/** Manifiesto de la PWA con la identidad del club. Lo sirve app/manifest.ts. */
export function buildWebManifest(cfg: ClientConfig): WebAppManifest {
  return {
    id: `/?club=${cfg.identity.clientId}`,
    name: cfg.pwa.name,
    short_name: cfg.pwa.shortName,
    description: cfg.pwa.description,
    lang: cfg.locale.language,
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: cfg.colors.background,
    theme_color: cfg.colors.theme,
    icons: [
      { src: cfg.assets.pwaIcon192, sizes: '192x192', type: mime(cfg.assets.pwaIcon192), purpose: 'any' },
      { src: cfg.assets.pwaIcon512, sizes: '512x512', type: mime(cfg.assets.pwaIcon512), purpose: 'any' },
      { src: cfg.assets.pwaMaskable, sizes: '512x512', type: mime(cfg.assets.pwaMaskable), purpose: 'maskable' },
    ],
  };
}
