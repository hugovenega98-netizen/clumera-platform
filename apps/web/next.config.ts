import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfig, missingAssets } from '@clumera/config/node';
import { withSerwist } from '@serwist/turbopack';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));

// La identidad del club se valida al compilar: una config inválida o con recursos faltantes corta el build.
const clientConfig = loadClientConfig();
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
  turbopack: { root: path.join(here, '../..') },
  transpilePackages: ['@clumera/kernel', '@clumera/config', '@clumera/catalog', '@clumera/notifications', '@clumera/ui'],
  // Sin secretos: client.config.json los rechaza al validar.
  env: { CLUMERA_CLIENT_CONFIG_JSON: JSON.stringify(clientConfig) },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
