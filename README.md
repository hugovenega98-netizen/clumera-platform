# Clumera 2.0 — clumera-platform

Monorepo de Clumera 2.0: un solo core, la **Persona** en el centro y ocho módulos licenciables
conectados por servicios compartidos. Cada club recibe su propia instalación (un proyecto de
Vercel y una base de Neon) con su identidad visual, corriendo el mismo código.

Plan de trabajo: [Clumera 2.0 — Plan integral del nuevo repositorio](https://claude.ai/artifact/8hokBnnrBQpeFndWEZ3YkG).

## Estado

**Fase 0 · Base de la plataforma — en curso.** Ver [docs/FASE_0.md](docs/FASE_0.md) para lo hecho,
lo pendiente y cómo verificar el criterio de terminado.

## Estructura

```
apps/
  web/              Next.js (App Router): PWA del club, páginas públicas y API
packages/
  kernel/           errores, eventos de dominio, manifiestos de módulo, licencias firmadas, permisos con ámbito
  config/           contrato client.config.json v2, validador, variables --client-*, manifiesto PWA
  db/               esquema Prisma, migraciones y cliente
  notifications/    push web con VAPID
  ui/               tokens del rediseño y componentes base
  catalog/          catálogo de módulos (core + 8 licenciables) y roles base
  modules/          facilities, bookings, access, schools, summer, tournaments, events, store
tooling/            verificador de reglas de dependencia y licencia de desarrollo
```

Llegan en sus hitos: `identity`, `finance`, `agenda`, `credentials`, `enrollments`, `files`,
`audit`, `reports`, `sports`, y las apps `lab` y `management`.

### Reglas de dependencia (verificadas en CI)

Cada paquete declara su capa en `package.json` → `"clumera": { "layer": ... }`.

| Capa | Puede depender de |
| --- | --- |
| `kernel` | nadie |
| `service` | kernel y otros servicios |
| `module` | kernel y servicios — nunca otro módulo; se comunican por eventos de dominio |
| `catalog` | kernel, servicios y módulos (solo reúne manifiestos) |
| `app` | todo; son las únicas que importan Next.js |

`npm run check:deps` falla si se rompe alguna.

## Requisitos

- Node 22.12 o superior (`.nvmrc`)
- npm 10 (workspaces). Usar `npm ci` con el lockfile.

## Primeros pasos

```bash
npm ci
cp client.config.example.json client.config.json   # identidad del club (no se commitea)
cp .env.example apps/web/.env.local                 # completar lo necesario
npm run dev                                         # http://localhost:3000
```

Sin licencia solo se encienden los módulos core. Para probar módulos licenciados en local:

```bash
npm run license:dev -- facilities bookings   # imprime CLUMERA_LICENSE_PUBLIC_KEY y CLUMERA_LICENSE
```

Claves de push: `npm run push:keys -w @clumera/notifications`.

## Verificación

```bash
npm run check   # reglas de dependencia + lint + tipos + pruebas
npm run build
```

El service worker se prueba sobre `npm run build && npm run start -w @clumera/web`, no en `next dev`
(en desarrollo está desactivado).

## Instalación por club

- `client.config.json` define nombre, colores, logos, textos, dominio y módulos visibles. Se valida
  al compilar: campos inválidos, secretos, recursos faltantes o contraste insuficiente cortan el build.
- La licencia llega firmada por Management (Ed25519). La instalación solo tiene la clave pública y
  la verifica en el servidor; sin licencia válida quedan solo los módulos core.
- Un módulo sin licencia se rechaza dos veces: en el proxy de Next.js y dentro de cada Route Handler.
