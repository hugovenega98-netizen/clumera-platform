# Fase 0 · Base de la plataforma

Criterio de terminado (plan): **la PWA se instala en Android y iPhone, recibe un push real, y la API
rechaza un módulo sin licencia.**

## Estado

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| La API rechaza un módulo sin licencia | ✅ | Unitarias (proxy y Route Handler) + e2e: 403 por Lab y directo contra el core |
| La PWA es instalable (manifiesto, íconos, SW, sin conexión) | ✅ en Chromium | e2e escritorio y Pixel 7: manifiesto, SW registrado con alcance `/`, página sin conexión |
| Instalar en Android y iPhone reales | ⏳ | Requiere abrir Lab en los teléfonos (ver abajo) |
| Push real | ⏳ | Envío por bandeja + push implementado; claves VAPID cargadas en Lab; falta probarlo en el dispositivo real |

## Qué hay

| Entregable | Dónde |
| --- | --- |
| Monorepo, CI (reglas de dependencia, lint, tipos, pruebas sobre PostgreSQL, control de migraciones, build, Playwright) | raíz, `.github/workflows/ci.yml` |
| Kernel: eventos, manifiestos, licencias Ed25519, `can()` con ámbito | `packages/kernel` |
| Config por club en el repo: `clients/<id>/client.config.json` + `public/`; `CLUMERA_CLIENT_ID` elige | `clients/`, `packages/config` |
| Esquema y migraciones de Fase 0; outbox idempotente | `packages/db` |
| Autenticación: activación y recuperación por enlace de un solo uso, sesiones httpOnly (`__Host-`), bloqueo por intentos, límite de solicitudes en PostgreSQL, CSRF por origen | `packages/identity`, `apps/web` |
| Correo: Resend o bandeja de desarrollo | `packages/mail` |
| Avisos: bandeja única sin duplicados, push a todos los dispositivos de la cuenta, cron del outbox | `packages/notifications`, `apps/web/app/api/cron/outbox` |
| PWA: manifiesto por club, Serwist, página sin conexión estática con la identidad del club | `apps/web` |
| Lab mínimo con la marca de Clumera Lab: 12 perfiles, bandeja de correo, restaurar; reenvía al core de Lab (mismo origen) | `apps/lab`, `clients/clumera-lab` |
| Matriz de permisos con los perfiles de Lab (integración, `/lab/permisos` y e2e por rol) | `apps/lab/src/permissions-matrix.ts` |
| Management: acceso de administrador, alta de instalación con licencia firmada, config y variables, reemisión | `apps/management` |
| Recorridos e2e (escritorio, móvil, 320 px), incluidos permisos por rol | `e2e/` |

## Lab desplegado

- Lab (entrada de la demo): https://clumera-platform-lab.vercel.app/lab
- Core de Lab: https://clumera-platform-lab-core.vercel.app
- Base: Neon `clumera-platform-lab`, base `clumera_lab` (proyecto nuevo; los de la versión anterior no se tocaron).
- Las migraciones corren en el build del core de Lab. La primera vez hay que tocar **Restaurar datos base** en /lab para sembrar.

### Prueba en dispositivo

1. Android (Chrome): abrir Lab, entrar con un perfil, menú ⋮ → *Instalar app*.
2. iPhone (Safari, iOS 16.4+): Compartir → *Agregar a inicio*, y abrir la app desde el ícono (push solo funciona así).
3. En la app instalada: *Mi cuenta* → *Activar avisos y probar*. Debe llegar el aviso y aparecer en *Avisos*.

## Pendiente

- Management desplegado en Vercel (`clumera-platform-management`, Neon `clumera-platform-management`). La contraseña de administración se elige en `/configurar` y su hash se carga en `MANAGEMENT_ADMIN_PASSWORD_HASH`. La licencia de Lab ya está firmada con la clave de Management.
- `main` como rama por defecto y protección de rama (hoy la rama por defecto es `fase-0/base-plataforma`).
- CAPTCHA liviano en endpoints públicos (el plan lo pide; hoy hay límite de solicitudes).
- Restaurar Lab por sesión de demo (hoy vacía y resiembra la base dedicada entera).
