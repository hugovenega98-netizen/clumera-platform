# Hito B · Clumera Instalaciones

Plan: «Agenda central, Instalaciones, Reservas (pública y de socios, señas, cancelaciones, reservas
fijas), Accesos con Recepción». Se entrega en tres tramos.

## Tramo 1 · Agenda central, Instalaciones y reservas de socios (entregado)

| Qué | Dónde |
| --- | --- |
| Agenda central (servicio compartido): ocupaciones por espacio, sin superposiciones aun con solicitudes simultáneas (bloqueo transaccional por espacio), prioridad bloqueo > partido > torneo > evento > escuela > reserva, retenciones que vencen solas | `packages/agenda` |
| Instalaciones: espacios, estado físico aparte de la ocupación, reglas (turno, horario, anticipación, retención, cancelación, seña, pagar en el club), tarifas por franja (socio / no socio) y bloqueos | `packages/modules/facilities`, `/instalaciones`, `/instalaciones/espacios` |
| Reservas de socios: turnero, confirmar y pagar (completo, seña o en el club), checkout de Finanzas, `payment.approved` confirma, liberación automática del turno retenido (se estira si hay un pago en curso), pago tardío con turno tomado → reintegro, cancelación con plazo | `packages/modules/bookings`, `/reservas`, `/reservas/confirmar` |
| Reservas del día para el encargado (cancelar avisa a la persona) y reintegros pendientes | `/reservas/gestion` |
| Avisos: reserva confirmada, turno liberado, pago tardío, cancelada por el club | `apps/web/src/lib/consumers.ts` |

Quién: `bookings:book` (socios), `facilities:*` y `bookings:manage` (Encargado de instalaciones,
acotable por espacio con el ámbito `venue:<slug>`), Superadmin. Cada ruta de módulo llama a
`requireModule()`; con la licencia apagada responde 403 (`apps/web/test/module-routes.test.ts`).

Lab: F5-1 y F5-2, Pádel 1 y 2, Pileta, Quincho, Salón y Gimnasio (fuera de servicio), con escuela,
torneo, evento y un bloqueo en la agenda, y reservas confirmada, pagada con seña, retenida y cancelada.

Pendiente de este tramo: Deportes todavía no ocupa la agenda (los partidos tienen su lugar como texto).

## Tramo 2 · Reserva pública sin cuenta y reservas fijas

## Tramo 3 · Accesos con Recepción
