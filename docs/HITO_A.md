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

## Deportes A (entregado)

| Qué | Dónde |
| --- | --- |
| Catálogo de 12 deportes y lógica portada del core anterior sin cambios (reloj por tiempos o cuartos, sets de vóley, entradas de softball, puntos, disponibilidad), con sus pruebas | `packages/sports/src/logic.ts` |
| Deportes, equipos (ámbito para roles y arancel), planteles, partidos, convocatorias, incidencias, reloj y ausencias | `packages/sports`, migración `hito_a_deportes` |
| Mis deportes: planteles propios y de la familia a cargo, convocatoria (Voy / No puedo), partidos, ausencias, rendimiento | `/deportes`, `/deportes/equipos/[id]` |
| Coach: plantel con disponibilidad, programar partido (convoca al plantel), formación, publicar minuto a minuto, cerrar como jugado o suspender | `/deportes/equipos/[id]?vista=plantel`, `/deportes/partidos/[id]` |
| Mesa de control: reloj, incidencias por equipo y jugador de la formación, deshacer, final (el coach confirma) | `/deportes/mesa`, `/deportes/mesa/[id]` |
| Minuto a minuto: privado para el club o público si el coach lo publica; se actualiza solo | `/vivo/[id]` |
| Administración: deportes, equipos con arancel, planteles; aranceles del mes a Finanzas, separados por deporte y equipo | `/admin/deportes` |

Criterio del hito: Ana (Lab) juega Hockey y Vóley y es responsable de Tomás (Rugby M12): una cuenta,
sus convocatorias y las de Tomás, y en Pagos cada cargo separado (cuota, Hockey · Damas, Vóley ·
Mixto, Tomás · Rugby · M12). Martín es coach de M19 y juega en el plantel superior.

Quién: la mesa opera solo los deportes de su ámbito; el coach, sus equipos; administración de
deportes, Superadmin. Recepción y Socio: sin mesa ni administración (403).

## Deportes B (entregado)

| Qué | Dónde |
| --- | --- |
| Salud: la persona o su responsable informa una lesión; Médico/Kine evalúa (estado, disponibilidad, indicaciones, nota privada) con historial inmutable; el coach ve solo la disponibilidad en el plantel | `packages/sports/src/health.ts`, `/deportes/salud`, `/deportes/salud/[id]` |
| `sports:health.view` es una acción explícita: ningún comodín la concede, ni el de Superadmin | `packages/kernel/src/permissions.ts` |
| Transmisión de YouTube en el minuto a minuto (solo un id validado; embed sin cookies) | `packages/sports/src/extras.ts`, `/deportes/partidos/[id]`, `/vivo/[id]` |
| Pases de invitado: código por partido (se guarda su HMAC), cookie firmada de 12 h, revocables, sin valor al terminar el partido | `/api/sports/matches/[id]/guest-passes`, `/api/sports/guest` |
| Seguir partido y aviso por incidencia a convocados, sus responsables y seguidores (outbox `match.event_recorded`) | `apps/web/src/lib/consumers.ts` |
| Planilla transitoria (jugadores de un partido) y cambios desde la mesa | `/deportes/partidos/[id]`, `/deportes/mesa/[id]` |

Lab: Gonzalo Núñez (Primera) con seguimiento «Con restricciones» y Iván Rojas (M19) con un reporte
sin evaluar; datos ficticios. Los avisos de salud son genéricos y los eventos del outbox no llevan
datos clínicos.

## Identidad — administración del padrón (entregado)

| Qué | Dónde |
| --- | --- |
| Corregir datos de una persona; el documento solo se reemplaza (digest + últimos 4) y la auditoría guarda qué campos cambiaron, nunca los valores | `packages/identity/src/admin-people.ts`, `/admin/personas/[id]?tab=datos` |
| Membresía: alta, cambio de estado con motivo (baja e inactiva cierran la vigencia; reactivar la reabre) y cambio de categoría | pestaña Membresía de la ficha, `PATCH /api/identity/memberships/[id]` |
| Familias: crear grupo, sumar con rol y vínculo, quitar; un grupo con personas a cargo siempre tiene responsable | pestaña Familia, `/api/identity/families…` |
| Importar padrón desde .xlsx o .csv: revisión por fila (alta, actualiza, sin cambios, error) y confirmación; reconoce por documento o N° de socio y frena posibles duplicados | `packages/identity/src/import.ts`, `/admin/personas/importar` |

Quién: todo con `identity:person.manage` (Superadmin). Contabilidad ve el padrón pero no lo cambia; Socio, nada.

## Siguiente

- Módulos licenciables del plan, con sus roles y pantallas ya en el lienzo: reservas e instalaciones, escuelas y colonia, torneos, eventos, tienda y control de acceso en Recepción.
