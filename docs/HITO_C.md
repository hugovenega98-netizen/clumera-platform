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

## Tramo 2 · Colonia de verano: caso C (entregado)

| Qué | Dónde |
| --- | --- |
| Servicio de Archivos en la base (decisión: Neon): metadatos y contenido separados; el tipo se decide por la firma del archivo (PDF, JPG, PNG, WEBP), hasta 4 MB (límite de cuerpo de Vercel); descarga siempre como adjunto, sin que el navegador adivine el tipo, y auditada | `packages/files`, `FileObject` / `FileBlob`, `GET /api/files/<id>` |
| Retiro autorizado en Identidad (vale para todo el club): la persona autorizada existe una sola vez (por documento) y el documento queda como digest + últimos 4; los responsables son titulares; se revoca | `packages/identity/src/pickup.ts`, `POST /api/identity/pickups`, `DELETE /api/identity/pickups/<id>` |
| Colonia: grupos por edad y turno con cupo (servicio de Inscripciones), documentos que pide la propuesta (apto físico — dato de salud —, DNI, autorización de salidas), 10% desde el segundo hermano, cargo único a Pagos | `packages/modules/summer`, `ProgramDocument`, `EnrollmentDocument` |
| La familia inscribe: el lugar queda tomado («falta completar»); sube documentos, autoriza retiros, deja contacto de emergencia y uso de imagen, y paga con Mercado Pago | `/verano`, `/verano/inscripcion/<id>`, `POST /api/m/summer/enrollments`, `…/documents/<código>`, `…/details`, `…/withdraw` |
| Se confirma sola con todos los documentos aprobados y el pago acreditado, en cualquier orden (consumidor `summer:payment-approved` y la revisión) | `refreshCampEnrollment`, `confirmPaidCamp` |
| Coordinación: indicadores (confirmados, pendientes de pago, espera, documentación incompleta), grupos con cupo, revisión de documentos (rechazo con motivo, la familia sube otro) y quiénes retiran a cada chico | `/admin/verano`, `POST /api/m/summer/documents/<id>/review` |
| Avisos a la familia: confirmada, lugar liberado, documento rechazado | consumidor `notifications:enrollment` |

Quién: `summer:camp.enroll` (socios, para su familia a cargo), `summer:manage` (Coordinador) y
`summer:document.sensitive.view` para el apto físico: permiso propio que ningún comodín concede (ni
Superadmin); lo tienen la coordinación y salud. Casos `camp-enroll`, `camp-manage` y
`camp-health-doc` de la matriz. Todas las rutas llaman a `requireModule('summer')`.

Lab: colonia de enero (4 grupos, documentos, 10% familiar); Sofía Gómez con documentos por revisar y
su abuela autorizada; la socia tiene ahora dos hijos (Tomás y Lola) para recorrer el caso C.

Límites conocidos: la coordinación crea la temporada y los grupos de colonia desde el seed (la pantalla
de alta queda para el siguiente tramo); el profesor de colonia todavía no ve la lista de retiros en su
asistencia; sin firma digital (la autorización firmada se sube como archivo); pases de pileta: siguiente
tramo.

## Tramo 3 · Torneos con página pública (caso D)
