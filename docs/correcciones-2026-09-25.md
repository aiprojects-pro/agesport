# Versión 1.1.0 — registro, perfiles y administración

## Comportamiento corregido

- El registro con cuatro o más especialidades ya no reutiliza las posiciones 1–3, que provocaban una violación de unicidad. La edición conserva todas las especialidades.
- El estado seleccionado en Accesos generados filtra tabla y CSV; se muestra estado y contador. Las respuestas de filtros anteriores no sobrescriben una selección posterior.
- Provincia ausente en importaciones se detecta antes de aprobar. La aprobación es transaccional, evita dobles altas y diferencia cuenta creada de correo enviado.
- Bienvenida y recuperación utilizan las páginas correctas; las rutas antiguas de emails redirigen a los accesos válidos. La recuperación usa un script compatible con CSP.
- Los fallos de SMTP se comunican como tales. El panel conserva durante 90 días un historial de destinatario, fecha y aceptación/fallo, sin contenido, contraseñas o tokens. Aceptación SMTP no prueba recepción en el buzón.
- Teléfono profesional existente conservado; nuevo teléfono personal cifrado, oculto a otros socios salvo autorización independiente. Sector estructurado, rol principal y segundo rol distintos, integrados en perfil, importación/exportación, directorio, mapa y distribución de roles.
- El perfil permite elegir visibilidad de directorio y mapa por separado. Los resultados del directorio y las fichas respetan la visibilidad; las cuentas importadas no adquieren permisos por defecto.
- Mejora de textos, ayudas, teclado, foco y adaptación móvil. La contraseña solicitada pertenece al Mapa del Talento.

## Publicación

Se conservan los cambios de main sobre integridad de backups (PR #2).
Las migraciones 018 y 019 son aditivas. La 018 conserva los campos anteriores, añade el segundo teléfono/rol y sector, y amplía el orden de especialidades. Mapea los valores antiguos Público/Privado a sector, sin reinterpretar Mixto/Otros. La 019 crea el historial de resultados SMTP.

En producción, el arranque aplica las migraciones pendientes antes de escuchar tráfico; usa el registro histórico `_migrations` y un bloqueo de migración. No se ejecuta el inicializador de administradores ni se cambian sus contraseñas.

La imagen genera `public/version.json` con versión y SHA-256 del código. `/health` expone el mismo identificador. Comparar ambos con el repositorio permite verificar que se sirve la versión construida.

Para revertir la aplicación, el código anterior puede trabajar con las columnas aditivas; no borrar estas columnas ni datos nuevos. Tener presente que volver al código anterior reintroduce la limitación de especialidades.

## Validación

49 pruebas: 27 unitarias, 4 regresiones anteriores, 6 flujos públicos y 12 sobre incidencias y mejoras de esta versión. Base PostGIS aislada; SMTP simulado sólo en pruebas automáticas. Incluye validaciones, altas físicas/corporativas con todas las especialidades, perfil y consentimiento, filtros/CSV, importación, errores SMTP, privacidad, enlaces antiguos y reaplicación de la migración.

Comprobación manual en navegador: registro a 320 px con dos teléfonos, sector, dos roles y cuatro especialidades; alta correcta. Filtro de tabla: 3 cuentas totales, 1 pendiente y 0 suspendidas en datos locales. Formulario y administración sin desbordamiento horizontal de página a 320 px. No equivale a una certificación completa de accesibilidad ni a pruebas en dispositivos físicos.
