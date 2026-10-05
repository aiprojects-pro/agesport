# Explorador de talento para socios — v1.5.0

## Problema observado

La comprobación de la intranet encontró 22 cuentas aprobadas y activas con visibilidad habilitada, distribuidas en 13 coordenadas distintas. Varias personas compartían punto. El mapa anterior no distinguía bien personas de ubicaciones y solo recargaba al entrar o mediante el botón.

## Comportamiento nuevo

- Mapa y lista de fichas visibles simultáneamente. Los marcadores agrupan las ubicaciones coincidentes o cercanas y muestran cuántas personas contienen. Al abrirlos se puede consultar a todos sus integrantes.
- Búsqueda por nombre, entidad, localidad, provincia y especialidad, sin depender de tildes. Filtros combinables por provincia, actividad principal o secundaria, especialidad, disponibilidad, sector y posibilidad de mensajería.
- Accesos rápidos a colaboradores, mentores, ponentes, personas con disponibilidad y socios de la misma provincia. Las categorías proceden de las declaraciones del perfil; no se infieren habilidades.
- Colores por actividad principal o disponibilidad, con leyenda que también permite filtrar. Fichas ordenables por nombre, disponibilidad o incorporación.
- Actualización cada 60 segundos mientras la página está visible, al volver a ella y mediante el botón. Conserva los filtros y el zoom. Los errores de actualización se señalan y la última consulta sigue disponible; una sesión caducada borra los resultados.
- Los perfiles elegibles sin coordenadas se mantienen en la lista y se identifican como ubicación pendiente. Se intenta la referencia provincial cuando faltan coordenadas municipales válidas.
- Indicadores y gráficos calculados con el mismo conjunto filtrado que la lista.
- Diseño adaptado a móvil, navegación por teclado y lista utilizable aunque no cargue Leaflet.

## Visibilidad

Se mantiene la selección vigente: cuentas aprobadas y activas que permiten mostrarse en el mapa. La vista de administración puede incluir las que se han ocultado a otros socios. No se modifican preferencias ni se crean migraciones. Los botones de perfil y mensajería respetan las opciones del destinatario.

## Validación

Pruebas del modelo: filtros combinados, actividad secundaria, tildes, disponibilidad no declarada, agrupación de 300 perfiles sin pérdidas y ordenación sin modificar los datos originales.

Pruebas de API: inclusión de perfiles sin ubicación, exclusión de perfiles ocultos, respeto a opciones de contacto, cambios de visibilidad en consultas posteriores y rechazo de sesiones suspendidas.

Prueba de navegador con datos ficticios en escritorio (1440 px) y móvil (390 px): búsqueda, filtros rápidos, agrupaciones, colores, recuperación tras fallo de red, retirada de visibilidad reflejada automáticamente en menos de un ciclo, conservación del zoom y filtros, lista sin biblioteca de mapa y ausencia de desbordamiento horizontal.

## Recorrido recomendado

1. Entrar como socio y abrir «Explorar talento».
2. Comparar el número de socios con los números de los grupos del mapa.
3. Pulsar «Busco colaboración» o «Mentores» y seleccionar una provincia.
4. Abrir un grupo, localizar una persona en la lista y consultar su perfil.
5. Usar «Enviar mensaje» cuando el destinatario lo tenga habilitado.
6. Limpiar filtros y cambiar los colores a disponibilidad.
7. Consultar los indicadores debajo del mapa; responden a los mismos filtros.

Validación local completada: 33 pruebas unitarias y 47 pruebas de API/regresión. Dos archivos se repitieron por separado sin aislamiento de proceso por un fallo de serialización del ejecutor de Node; todas sus aserciones pasaron. El mismo fallo se reprodujo en CI después de pasar todas las aserciones del archivo. El flujo de GitHub mantiene un proceso independiente por archivo con Node 22 y desactiva el aislamiento adicional del ejecutor (`--experimental-test-isolation=none`), evitando ese canal de serialización. Opción documentada en https://nodejs.org/download/release/v22.23.0/docs/api/cli.html.
