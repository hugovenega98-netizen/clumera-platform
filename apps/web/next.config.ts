import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { renderOfflineHtml } from '@clumera/config';
import { assertConfigMatchesFolder, clientDir, loadClientConfig, missingAssets, resolveClientConfigPath, syncClientAssets } from '@clumera/config/node';
import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

// La identidad del club (clients/<CLUMERA_CLIENT_ID>) se valida al compilar y sus recursos se copian
// a public/: una config inválida o con recursos faltantes corta el build.
const configFile = resolveClientConfigPath();
const clientConfig = loadClientConfig(configFile);
assertConfigMatchesFolder(clientConfig, configFile);
syncClientAssets(clientDir(), path.join(here, 'public'));
writeFileSync(path.join(here, 'public', 'offline.html'), renderOfflineHtml(clientConfig));
const missing = missingAssets(clientConfig, path.join(here, 'public'));
if (missing.length) throw new Error(`client.config.json apunta a recursos inexistentes:\n  - ${missing.join('\n  - ')}`);

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // forbidden() en pantallas sin permiso: 403 real, no solo esconder.
  experimental: { authInterrupts: true },
  turbopack: { root: path.join(here, '../..') },
  transpilePackages: ['@clumera/kernel', '@clumera/config', '@clumera/catalog', '@clumera/notifications', '@clumera/finance', '@clumera/sports', '@clumera/ui'],
  // Sin secretos: client.config.json los rechaza al validar.
  env: { CLUMERA_CLIENT_CONFIG_JSON: JSON.stringify(clientConfig) },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
