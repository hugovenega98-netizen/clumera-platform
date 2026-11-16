import { createSerwistRoute } from '@serwist/turbopack';

// Sirve /serwist/sw.js compilado desde app/sw.ts con el manifiesto de precache del build.
// El service worker se prueba sobre `next build && next start`, no en `next dev`.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: 'app/sw.ts',
  // public/offline.html (generado al compilar) entra al precache con el resto de public/.
  useNativeEsbuild: false,
});
