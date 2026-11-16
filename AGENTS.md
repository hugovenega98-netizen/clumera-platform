# Instrucciones para agentes — clumera-platform

Monorepo de Clumera 2.0. Una instalación corresponde a un club (un proyecto de Vercel y una base de Neon).
El plan vigente es «Clumera 2.0 — Plan integral del nuevo repositorio»; las decisiones de arquitectura salen de ahí.

## Forma de trabajar
- Leer el estado actual del repositorio antes de editar. Los recuerdos y los chats no sustituyen al código vigente.
- Trabajar desde una rama basada en el main actual; no sobrescribir trabajo ajeno.
- Mantener los cambios acotados y entregar: rama/PR, comportamiento resultante, verificaciones ejecutadas y limitaciones.
- No afirmar que pasó una comprobación que no se ejecutó.
- No publicar ni fusionar por el solo hecho de haber preparado una rama.
- No registrar secretos, cadenas de conexión ni datos personales o clínicos en commits, documentación, capturas o respuestas.
- Verificar el destino antes de migraciones, seeds o acciones sobre proveedores; nunca usar la base de un club para pruebas (usar una rama de Neon dedicada).
- Usar el lockfile y `npm ci`. Node 22.12+.

## Arquitectura
- La lógica de negocio vive en `packages/*` sin depender de Next.js. Solo `apps/*` importa Next.js.
- Respetar las capas (`clumera.layer` en cada package.json): un módulo nunca importa otro módulo; se comunican por eventos de dominio guardados en el outbox.
- Ningún módulo crea su propio sistema de cobros, usuarios, avisos o permisos: usa los servicios compartidos.
- Cada módulo declara su manifiesto (permisos, rutas, navegación, eventos) y se agrega a `packages/catalog`.
- La autorización real es siempre del servidor: `can()` del kernel combina licencia + rol + ámbito.
- Toda ruta de módulo nueva debe llamar a `requireModule()` además de pasar por el proxy, y tener una prueba que la llame con la licencia apagada y espere 403.

## Reglas de producto
- No fijar nombres, colores o recursos de un club en componentes: todo sale de `client.config.json` vía variables `--client-*`.
- Datos clínicos con permiso propio; Coach, Contabilidad, Recepción y público nunca los reciben. Recepción ve validez y motivo, nunca deuda ni salud.
- El QR no contiene datos legibles. El documento se guarda como digest + últimos 4.
- La demo (selector de perfiles, restaurar) vive solo en `apps/lab`, nunca en el core.
- Objetivos táctiles de 44 px, contraste AA, anchos de 320 a 1440 px. Verificar móvil y escritorio cuando cambia la interfaz.

## Verificación
- Siempre: `npm run check` y `npm run build`.
- Cambios de PWA o push: además `npm run build && npm run start -w @clumera/web` y revisar `/manifest.webmanifest` y `/serwist/sw.js`.
- Cambios de esquema: nueva migración en `packages/db/prisma/migrations` y `npm run test -w @clumera/db` (aplica las migraciones sobre PGlite).
- Documentar si una prueba necesita un entorno que no está disponible.
