# Delegación provincial — v1.6.0

Perfil aprobado: consultar y filtrar los socios aprobados y activos de una provincia y enviarles comunicaciones informativas respetando las preferencias de mensajería y avisos por correo.

## Asignación y acceso

Desde Administración → Usuarios y roles, un superadministrador puede crear una cuenta con el rol «Delegado provincial» y una provincia obligatoria, o cambiar los permisos de una cuenta existente. La provincia se valida y normaliza con el catálogo. No se asigna este acceso a ninguna persona automáticamente.

El delegado entra por /acceso-admin.html y se dirige a /delegacion.html. El panel muestra la provincia asignada, filtros de nombre/entidad, tipo de socio, actividad principal o secundaria, especialidad y disponibilidad. Los datos de consulta se limitan a nombre, entidad, localidad, tipo/actividad y recepción de comunicaciones; no se entregan DNI, teléfonos ni direcciones de correo.

El envío requiere revisar los destinatarios y confirmar. El delegado consulta el estado de sus propias comunicaciones de la provincia actual. «Aceptados» representa aceptación SMTP, no recepción en bandeja de entrada ni lectura.

## Límites comprobados en servidor

- La provincia procede de la cuenta activa en la base de datos, no del navegador ni de los datos antiguos del token.
- No hay acceso delegado a la administración general, mapa administrativo, configuración, usuarios/roles, editor legal, exportaciones ni perfiles privados mediante rutas de socio.
- Los socios ordinarios tampoco pueden invocar las rutas de delegación.
- Las comunicaciones fuerzan el ámbito provincial en la selección de destinatarios. Se vuelven a comprobar las preferencias y la provincia del socio, así como la vigencia de la delegación, antes de cada envío pendiente.
- Si cambia la provincia, el rol o la activación de la cuenta, los permisos nuevos se aplican a las sesiones existentes. El histórico queda limitado al autor y a la provincia actual.
- La migración 025 añade provincia_delegacion sin cambiar roles ni cuentas existentes. Las asignaciones quedan en la auditoría. Se protege al último superadministrador frente a la degradación a delegado.

## Validación

Cinco pruebas de integración específicas verifican delimitación territorial, intentos de acceso mediante rutas alternativas, creación/asignación, preferencias de destinatarios, envío con transporte simulado, histórico, cambio de provincia durante una campaña y desactivación de una sesión existente.

Prueba de navegador con datos ficticios: inicio de sesión y redirección, filtrado, revisión y envío simulado, invalidación de la revisión al modificar el mensaje, cambio de provincia desde el selector de administración, ausencia de desbordamiento en 390 px y ausencia de errores JavaScript.

No se han creado delegados ni enviado comunicaciones reales durante estas pruebas. Para asignar una cuenta real hacen falta la persona, su correo y su provincia.
