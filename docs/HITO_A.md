# Hito A · Clumera Club

Orden acordado: **Identidad → Finanzas → Deportes**. Cada pantalla, en teléfono (PWA) y escritorio;
cada permiso nuevo, con su caso en la matriz de Lab y su recorrido por rol en e2e.

## Identidad — socio (entregado)

| Qué | Dónde |
| --- | --- |
| Carnet con QR rotativo (30 s, sin datos legibles), carnet de los representados | `/carnet`, `packages/identity/src/credentials.ts` |
| Familia: responsables y a cargo | `/familia`, `packages/identity/src/family.ts` |
| Espacios: una cuenta, un espacio por participación | `/espacios`, `packages/identity/src/spaces.ts` |
| Validación del QR en la entrada (API; la pantalla de Recepción llega en el Hito B) | `POST /api/m/access/validate` |

## Identidad — administración (entregado)

| Qué | Dónde |
| --- | --- |
| Inicio institucional: socios activos, altas y bajas del mes, suspendidas, cuentas sin activar, socios por categoría | `/admin` |
| Padrón: búsqueda por nombre (sin importar acentos), N° de socio o documento (por digest); filtros con conteo | `/admin/personas`, `GET /api/identity/people` |
| Ficha: resumen, membresía con historial, familia, roles, cuenta y carnet, historial auditado | `/admin/personas/[id]` |
| Roles con alcance: asignar y quitar (auditado + evento `role.assigned` / `role.revoked`); superadmin solo lo da otro superadmin y nunca queda el club sin uno | `POST/DELETE /api/identity/people/[id]/roles` |
| Alta de persona con membresía opcional, sin duplicar por documento | `/admin/personas/nueva`, `POST /api/identity/people` |
| Revocar carnet con motivo; crear cuenta y enviar activación | `POST /api/identity/credentials/[id]/revoke`, `POST /api/identity/accounts` |
| Pantallas sin permiso: 403 real (`forbidden()`), además de no aparecer en el menú | `apps/web/src/lib/admin.ts` |

Quién: Superadmin todo; Contabilidad y Coordinador ven padrón y fichas (sin altas ni roles); el
resto, 403. La ficha nunca muestra datos clínicos ni la cuenta corriente.

Diseño: lienzo, páginas «3 · Administración (escritorio)» y «6 · Administración (móvil)».

## Siguiente

- Finanzas: cuenta unificada, cargos, Mercado Pago (necesita credenciales de prueba), conciliación; suma cobrado y morosidad al inicio institucional y habilita `/admin/finanzas`.
- Deportes, adaptado de clumera-cmp.
- Pendiente de Identidad: editar datos de la persona y cambiar el estado de la membresía desde la ficha; importar padrón desde Excel; familias desde la administración.
