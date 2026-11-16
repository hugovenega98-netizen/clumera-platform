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

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Página sin conexión: HTML estático sin JavaScript, para que el service worker la sirva en
 * cualquier navegación fallida sin depender de la app. Lleva la identidad del club.
 */
export function renderOfflineHtml(cfg: ClientConfig): string {
  const c = cfg.colors;
  return `<!doctype html>
<html lang="${esc(cfg.locale.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${c.theme}">
<title>Sin conexión · ${esc(cfg.identity.displayName)}</title>
<style>
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px 16px;box-sizing:border-box;font-family:Barlow,system-ui,-apple-system,'Segoe UI',sans-serif;background:${c.background};color:${c.text}}
main{width:min(100%,420px);background:${c.surface};border:1px solid #dce5ee;border-radius:16px;padding:24px}
img{width:48px;height:48px}h1{font-size:24px;margin:16px 0 8px}p{line-height:1.5}
a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 24px;border-radius:12px;background:${c.button};color:#fff;font-weight:600;text-decoration:none}
</style>
</head>
<body>
<main>
<img src="${esc(cfg.assets.emblem)}" alt="">
<h1>Estás sin conexión</h1>
<p>No pudimos conectarnos con ${esc(cfg.identity.displayName)}. Revisá tu conexión y volvé a intentar.</p>
<p>Lo que ya abriste antes sigue disponible.</p>
<a href="/">Reintentar</a>
</main>
</body>
</html>
`;
}
