# Fase 0 · Base de la plataforma

Criterio de terminado (plan): **la PWA se instala en Android y iPhone, recibe un push real, y la API
rechaza un módulo sin licencia.**

## Hecho

| Entregable | Dónde | Verificación |
| --- | --- | --- |
| Monorepo (npm workspaces + Turborepo), TypeScript estricto, ESLint | raíz | `npm run check` |
| CI: reglas de dependencia, lint, tipos, pruebas, build | `.github/workflows/ci.yml` | se ejecuta en cada PR |
| Reglas de dependencia por capa | `tooling/check-dependency-rules.mjs` | `npm run check:deps` |
| Kernel: errores, eventos de dominio, manifiestos y registro de módulos | `packages/kernel` | pruebas unitarias |
| Licencias firmadas Ed25519, verificadas en el servidor (falla cerrado) | `packages/kernel/src/license.ts` | alteradas, vencidas, de otro club y con otra clave se rechazan |
| Permisos con ámbito `can(actor, action, resource)` | `packages/kernel/src/permissions.ts` | coach por equipo, `:self`, módulo sin licencia |
| Contrato `client.config.json` v2 (dominio, módulos visibles, contraste AA, sin secretos) | `packages/config` | pruebas + validación al compilar |
| Esquema Prisma de Fase 0 y migración inicial | `packages/db` | la migración se aplica sobre PostgreSQL (PGlite) en las pruebas |
| Tokens del rediseño y componentes base | `packages/ui` | sin colores de club fuera de `--client-*`; táctil 44 px |
| Catálogo: 4 servicios core + 8 módulos, roles base | `packages/catalog` | permisos de roles existen; Recepción y Coach sin salud ni deuda |
| PWA: manifiesto por club, service worker (Serwist), página sin conexión | `apps/web/app/manifest.ts`, `app/sw.ts`, `app/~offline` | build de producción sirve `/manifest.webmanifest` y `/serwist/sw.js` |
| Push de punta a punta (VAPID) | `packages/notifications`, `apps/web/app/api/push/test` | botón «Activar avisos y probar» en el inicio |
| Bloqueo de módulos sin licencia en proxy y Route Handler | `apps/web/proxy.ts`, `src/lib/require-module.ts` | `/api/m/<modulo>/status` → 403 sin licencia, 200 con licencia |

## Pendiente para cerrar la Fase 0

1. **Autenticación**: cuentas con email/usuario, activación y recuperación por enlace de un solo uso,
   sesiones en cookie httpOnly, bloqueo por intentos, límite de solicitudes. El esquema ya está
   (`UserAccount`, `Session`, `ActivationToken`).
2. **Suscripciones push persistentes** por cuenta (`PushSubscription`) y envío desde el outbox; hoy
   `/api/push/test` manda un aviso sin guardar nada y solo existe con `CLUMERA_PUSH_TEST=1`.
3. **Prueba en dispositivo real**: desplegar Lab en Vercel, instalar en Android y iPhone (iOS 16.4+,
   agregada a inicio) y recibir el push de prueba.
4. **Lab mínimo** (`apps/lab`) y **Management con alta de instalación** (`apps/management`), incluida
   la firma de licencias.
5. Playwright: recorridos por rol y la prueba de licencia apagada contra el build.
6. Decidir de dónde sale `client.config.json` y los recursos de cada club en Vercel (ver abajo).

## Decisión abierta: config y recursos por club

Un repo, muchas instalaciones. Hoy el build lee `CLUMERA_CLIENT_CONFIG` (ruta relativa a la raíz) y
los recursos desde `apps/web/public`. Opciones:

- **A.** `clients/<clientId>/client.config.json` + `clients/<clientId>/public/` en el repo, y cada
  proyecto de Vercel define `CLUMERA_CLIENT_ID`; un paso previo al build copia los recursos.
- **B.** Management guarda config y recursos y el build los descarga (necesita token de Management en Vercel).

A es más simple y auditable; B evita commitear logos de clientes en el repo del core.
