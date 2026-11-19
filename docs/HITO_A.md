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

Diseño: lienzo, páginas «3 · Administración (escritorio)» y «6 · Administración (móvil)»; el comprobante, en las páginas del socio.

## Finanzas (entregado)

| Qué | Dónde |
| --- | --- |
| Libro: cargos (idempotentes por `source` + `sourceRef`), cobros, imputaciones con filas bloqueadas, bitácora de pagos; montos en centavos con CHECK en la base | `packages/finance`, migración `hito_a_finanzas` |
| Cuotas sociales del mes por categoría (`monthlyFee`), idempotentes | `POST /api/finance/dues` |
| Cuenta unificada del socio (lo suyo y lo de sus representados), pago online por concepto, historial y comprobantes imprimibles | `/pagos`, `/pagos/comprobante/[id]` |
| Buscador central: cuenta por persona, registrar cobro (efectivo, transferencia, posnet; parcial), emitir y anular cargos | `/admin/finanzas`, `/admin/finanzas/cuentas/[id]` |
| Números del mes, morosidad (+21 días), cobrado por medio, conciliación de Mercado Pago | `/admin/finanzas`, inicio institucional |
| Mercado Pago (Checkout Pro): preferencia con `external_reference` e idempotencia; webhook con firma `x-signature` obligatoria, estado y monto leídos de la API; duplicados y montos distintos quedan en la bitácora; el regreso del navegador nunca confirma | `packages/finance/src/gateway.ts`, `/api/webhooks/mercadopago` |
| Aviso «Pago acreditado» por el outbox (entrega inmediata y repaso del cron) | `apps/web/src/lib/consumers.ts` |

Quién: Contabilidad todo; Caja busca, ve la cuenta y cobra (sin emitir ni ver reportes); el socio ve
y paga lo suyo y lo de su familia a cargo; Recepción, Coach, Médico: 403.

Para habilitar Mercado Pago en una instalación: `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` (de la
aplicación en el panel de Mercado Pago) y la URL de notificaciones
`https://<dominio>/api/webhooks/mercadopago` (evento **Pagos**). Sin esas variables, el pago online no aparece. En Lab, además, `MP_TEST_PAYER_EMAIL` con un comprador de prueba: con credenciales de prueba, un email real hace fallar el checkout. En e2e se
prueba el circuito completo contra un simulador local de la API.

Pendiente de Finanzas: devoluciones y contracargos (hoy quedan «para revisar»), cajas con apertura y
cierre, débito automático, prueba con el sandbox real de Mercado Pago.

## Siguiente

- Deportes, adaptado de clumera-cmp.
- Pendiente de Identidad: editar datos de la persona y cambiar el estado de la membresía desde la ficha; importar padrón desde Excel; familias desde la administración.
