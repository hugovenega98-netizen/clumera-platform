import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientConfig } from '@clumera/config/node';
import type { NextConfig } from 'next';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientConfig = loadClientConfig();
if (clientConfig.identity.clientId !== 'clumera-lab') throw new Error('apps/lab solo se compila con CLUMERA_CLIENT_ID=clumera-lab');

const core = process.env.LAB_CORE_URL?.replace(/\/+$/, '');
if (!core) throw new Error('Falta LAB_CORE_URL: la URL de la instalación core de Lab (apps/web con clumera-lab)');

/**
 * Lab es la puerta de la demo: sirve /lab (selector de perfiles, restaurar, correo) y reenvía todo
 * lo demás a la instalación core de Lab. Mismo origen para el navegador, así la sesión que abre el
 * selector es la misma cookie que usa el core, sin agregar accesos demo al core.
 */
const nextConfig: NextConfig = {
  basePath: '/lab',
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: path.join(here, '../..') },
  transpilePackages: ['@clumera/kernel', '@clumera/config', '@clumera/catalog', '@clumera/identity', '@clumera/mail', '@clumera/ui'],
  env: { CLUMERA_CLIENT_CONFIG_JSON: JSON.stringify(clientConfig) },
  async rewrites() {
    return { beforeFiles: [], afterFiles: [], fallback: [{ source: '/:path*', destination: `${core}/:path*`, basePath: false }] };
  },
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }, { key: 'X-Frame-Options', value: 'DENY' }] }];
  },
};

export default nextConfig;
