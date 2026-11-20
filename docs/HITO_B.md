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

## Tramo 2 · Reserva pública sin cuenta y reservas fijas (entregado)

| Qué | Dónde |
| --- | --- |
| Reserva pública sin cuenta: solo los espacios con «Reserva sin cuenta» en sus reglas, tarifa general, pago online (completo o seña; nunca en el club). Nombre, celular, email y condiciones. Con sesión, `/reservar` lleva al turnero del club | `packages/modules/bookings/src/public.ts`, `/reservar`, `/reservar/confirmar`, `POST /api/m/bookings/public` |
| Persona invitada: se reutiliza por email; si el email es de un socio o de alguien con cuenta (en la ficha o como login), se le pide ingresar y no se crea nada — nunca se cargan cargos en la cuenta de otra persona | `guestPersonFor` |
| Enlace firmado de la reserva (HMAC con la clave de la instalación, `CLUMERA_DOC_PEPPER`): ver estado, reintentar el pago y cancelar con las mismas reglas que un socio. Llega por correo al reservar y en cada cambio (confirmada, liberada, pago tardío, cancelada por el club) | `/reservar/r/<token>`, `POST /api/m/bookings/public/<token>/{pay,cancel}`, consumidor `mail:public-booking` |
| Límites: 10 reservas públicas por IP y 4 por email por hora; 30 acciones con el enlace por IP cada 15 min | `RATE_RULES.publicBooking*` |
| Reservas fijas del encargado: el mismo turno cada semana entre dos fechas (hasta 26 semanas); cada semana es una reserva común a pagar en el club (sin tope de anticipación); las semanas ocupadas se saltean y se informan; se cancela la serie entera. Un solo aviso al cargarla y otro al cancelarla | `packages/modules/bookings/src/series.ts`, `/reservas/fijas`, `POST /api/m/bookings/series`, `POST /api/m/bookings/series/<id>/cancel` |
| Reservas del día: marca «Sin cuenta» (con el celular para contactar) y «Fija» | `/reservas/gestion` |

Quién: la reserva pública no pide sesión; la reserva fija, `bookings:manage` sobre el espacio
(caso `bookings-series` de la matriz). Las rutas nuevas llaman a `requireModule()` (403 con la
licencia apagada) y `/reservar` es del módulo, así que el proxy también la corta.

Lab: Fútbol 5 (F5-1, F5-2) se reserva sin cuenta con seña 30%; hay una reserva pública pagada
(Martina Ruiz) y una reserva fija de Pádel 1 los martes 22:00.

Límites conocidos: la reserva pública necesita Mercado Pago configurado y la clave de la instalación
(si falta, responde 503). Los reintegros quedan registrados, no se devuelven solos por Mercado Pago.

## Tramo 3 · Accesos con Recepción (entregado)

| Qué | Dónde |
| --- | --- |
| Puntos de acceso (entrada principal, pileta…) y registro de cada intento: permitido o denegado, motivo, lo que vio Recepción, cómo se validó (QR, búsqueda o excepción) y quién | `AccessPoint`, `AccessAttempt`, `packages/modules/access` |
| Validar en un punto: QR escaneado con la cámara (navegadores con lector de códigos), tipeado o de un lector USB, o la persona buscada por nombre, DNI o N° de socio. Responde validez, motivo y nombre; nunca deuda, salud ni ids internos | `checkAccess`, `POST /api/m/access/check`, `GET /api/m/access/people` |
| Caso B: una credencial revocada no entra (por QR ni por búsqueda); el código ajeno o adulterado también queda registrado | `packages/identity/src/credentials.ts` |
| Excepción autorizada sobre un rechazo de una persona identificada: con motivo, una sola vez, dentro de 15 minutos, auditada | `authorizeException`, `POST /api/m/access/attempts/<id>/override` |
| QR de las reservas: al confirmarse, la reserva tiene una credencial que vale desde 30 min antes hasta que termina el turno; cancelada, liberada o con pago tardío, se revoca. Se ve en el enlace de la reserva sin cuenta y, para quien no es socio, en «Mis reservas» | consumidor `access:booking-credential`, `GET /api/m/bookings/<id>/qr`, `GET /api/m/bookings/public/<token>/qr` |
| Pantalla de Recepción: punto de acceso, cámara, código, búsqueda, resultado grande, ingresos y rechazos de hoy, últimos intentos | `/recepcion` |

Quién: `access:validate`, `access:override` y `access:log.view` (Recepción y Superadmin; casos
`access`, `access-override` y `access-log` de la matriz). Recepción entra directo a `/recepcion`.
La validación de Hito A (`POST /api/m/access/validate`) también registra el intento.

Lab: puntos «Acceso principal» y «Pileta»; carnets vigentes, la membresía suspendida de Julieta
Méndez, el carnet revocado de Camila Torres, la credencial de la reserva de Martina Ruiz y algunos
intentos de hoy.

Límites conocidos: sin validación sin conexión (fuera de alcance de la primera versión); los
contadores son de intentos de hoy, no de ocupación (la ocupación de pileta y colonia llega con
Verano); los puntos de acceso se cargan por seed (su administración, `access:point.manage`, queda
para más adelante).
