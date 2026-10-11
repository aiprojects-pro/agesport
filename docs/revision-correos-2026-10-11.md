# Revisión de observaciones recibidas — 11 de octubre de 2026

Base: main acc156793b0a0e028b18ec8f7580c4d8795fa200, versión publicada 1.6.0.

## Evidencias revisadas

- Chipi, 2 y 6 de octubre: etiquetas de Ceuta/Melilla, cuenta antigua y error de directorio al entrar desde un aviso de mensaje.
- Jorge, 5 de octubre: socios ausentes del mapa; PDF con captura del diseño anterior (agrupaciones provinciales).
- Lourdes, 5 de octubre: no se ve en el mapa y no encuentra Contactar en su propia ficha; captura del diseño anterior.
- David, 7 de octubre: revisión sin fallos detectados.
- Rebotes de Gmail: direcciones administrativas no entregables y cuentas de prueba sin buzón.

## Comprobaciones actuales

Con la cuenta demo: directorio HTTP 200 (17 perfiles), mapa HTTP 200 (22 perfiles), conversaciones HTTP 200. Lourdes figura en el mapa en Málaga y acepta mensajes. Directorio y mapa tienen preferencias de visibilidad independientes; sus cifras no tienen por qué coincidir. La ausencia de Contactar en la propia ficha evita enviarse mensajes a uno mismo.

## Cambios 1.6.1

- Sin sesión, las páginas privadas conducen al acceso. El acceso de socios conserva la página de destino mediante una lista de rutas permitidas, evitando redirecciones externas. Los fallos temporales del servidor no se interpretan como sesión caducada.
- Etiquetas permanentes de Ceuta/Melilla y encuadre general que incluye ambas ciudades, sin inventar socios ni alterar sus permisos.
- Encontrarme en el mapa: limpia filtros, localiza el perfil, explica agrupaciones y distingue perfil no visible o sin ubicación; identificación «Tú» en la lista.
- Mi perfil explica por qué Contactar se muestra a los demás socios.
- Guardar la configuración SMTP conserva la autenticación en la recarga inmediata, descifrando la clave sólo en memoria.
- Buzón configurable para avisos de altas en la configuración de correo. Si está definido sustituye los emails de acceso administrativos. Sin override, sólo reciben avisos administradores globales, no delegados provinciales.

La captura de Chipi no acredita por sí sola la causa exacta del fallo histórico. Se comprobó un fallo real de navegación sin sesión y se corrigió; el directorio actual responde correctamente.

## Operaciones autorizadas separadamente

La usuaria confirmó destinar los avisos de altas al buzón AGESPORT y conservar la cuenta vigente de Chipi, desactivando la antigua sin borrar datos. La cuenta vigente estaba suspendida con nombre provisional «mm mm»; requiere completar su perfil. No se fusionan ni eliminan mensajes o consentimientos.

## Validación

38 pruebas unitarias locales, incluyendo retorno al destino y rechazo de rutas externas. Navegador local con datos ficticios: enlace privado → acceso → mensajes, etiquetas territoriales y localización de dos personas que comparten coordenadas. Las pruebas de base de datos se ejecutan en GitHub Actions (Docker no disponible en este equipo).
