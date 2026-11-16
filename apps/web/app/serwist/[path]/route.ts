import { createSerwistRoute } from '@serwist/turbopack';

// Sirve /serwist/sw.js compilado desde app/sw.ts con el manifiesto de precache del build.
// El service worker se prueba sobre `next build && next start`, no en `next dev`.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'app/sw.ts',
  additionalPrecacheEntries: [{ url: '/~offline', revision: process.env.VERCEL_GIT_COMMIT_SHA ?? crypto.randomUUID() }],
  useNativeEsbuild: false,
});
