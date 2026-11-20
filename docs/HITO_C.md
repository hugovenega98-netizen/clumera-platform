# Hito C · Clumera Actividades

Plan: Escuelas, Verano (pileta y colonia) y Torneos con página pública.
Terminado cuando: una familia inscribe a dos hijos en colonia con documentos y retiro autorizado, y
un torneo relámpago corre de inscripción a tabla final con resultados consistentes (casos C y D).

## Tramo 1 · Inscripciones y Escuelas (entregado)

| Qué | Dónde |
| --- | --- |
| Servicio compartido de Inscripciones: cupo con bloqueo por grupo (nunca se supera, aunque lleguen varias a la vez), lista de espera en orden, baja que promueve al primero y renumera, asistencia del día | `packages/enrollment` |
| Modelo: `Program`, `Group`, `Enrollment` (confirmada, pendiente, espera, baja), `Attendance` | migración `20261122100000_hito_c_inscripciones` |
| Escuelas: propuestas con edad, solo socios, cuota socio y general; grupos con días, horario, lugar, profesor y cupo | `packages/modules/schools` |
| La persona o su responsable inscribe; con lugar se confirma y la cuota del mes va a Pagos (concepto «escuela»; vence el 10, o 10 días después si la inscripción es del mes en curso). Sin lugar, lista de espera. Baja con motivo: anula la cuota impaga; el primero en espera queda inscripto con su cuota y aviso | `/escuelas`, `/escuelas/<propuesta>`, `POST /api/m/schools/enrollments`, `…/<id>/withdraw` |
| Avisos a la persona y a sus responsables: confirmada, en espera, se liberó un lugar | consumidor `notifications:enrollment` |
| Profesor: solo los grupos de la actividad de su rol; asistencia del día P / A / T, se corrige | `/escuelas/asistencia`, `POST /api/m/schools/groups/<id>/attendance` |
| Coordinación: propuestas y grupos con cupo, indicadores, inscriptos por grupo con bajas, nueva propuesta, nuevo grupo, emitir cuotas del mes (idempotente) | `/admin/escuelas`, `POST /api/m/schools/{programs,programs/<id>/groups,fees}` |

Quién: `schools:enroll` (socios, para sí y su familia a cargo), `schools:attendance.mark` con ámbito
de actividad (Profesor: «natacion»), `schools:manage` (Coordinador). Casos `schools-enroll`,
`attendance` y `schools-manage` de la matriz. Todas las rutas llaman a `requireModule('schools')`.

Lab: natación infantil (Tomás en martes y jueves; sábados lleno con lista de espera), escuela de
hockey y funcional adultos (solo socios); asistencia de la última clase.

Límites conocidos: los grupos no ocupan todavía la agenda central (se suma con Verano); «Avisar al
grupo» del profesor queda para más adelante; las cuotas de meses siguientes se emiten desde la
coordinación (no hay corrida automática).

## Tramo 2 · Verano: colonia y pileta (caso C)

Colonia con documentos obligatorios y retiro autorizado; pases de pileta con vigencia propia. Necesita
el servicio de Archivos (dónde se guardan los documentos: decisión pendiente).

## Tramo 3 · Torneos con página pública (caso D)
