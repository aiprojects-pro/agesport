# Versión 1.3.0: mejoras pedidas por la junta directiva

Resumen de lo corregido tras las pruebas de la junta, en el orden del documento de peticiones. Los bloques 1 y 2 (los que impedían el uso normal) están resueltos por completo. La migración `022` es aditiva e idempotente, y el servidor la aplica al arrancar en producción.

## 1. Errores bloqueantes

### Mensajería y correo: el aviso de «demasiadas peticiones desde esta IP»
**Causa.** El límite general de peticiones se contaba por IP. Varios socios que salen a Internet por la misma IP (oficina, delegación, red móvil, o el propio proxy si no se identificaba bien al usuario) agotaban juntos el cupo. Además, el nginx de producción limitaba `/api/auth/` a 5 peticiones por minuto y por IP, y cada página consulta la sesión en esa ruta.

**Solución.**
- Con la sesión iniciada, el límite cuenta por cuenta de socio o de administración, nunca por IP (`RATE_LIMIT_MAX_AUTHENTICATED`, 3000 peticiones cada 15 minutos por defecto). El límite por IP queda sólo para el tráfico anónimo de la API. Las páginas, los recursos estáticos y `/api/public` no cuentan.
- Se usa la IP real del usuario: `trust proxy` confía en las redes privadas (nginx, router de OpenShift) y se configura con `TRUST_PROXY`. Ahora se aplica antes de los limitadores.
- En nginx sólo quedan limitados el inicio de sesión, el registro y la recuperación de contraseña (30 por minuto, con ráfaga de 10).
- La mensajería se limita por socio: 60 mensajes cada 5 minutos (`RATE_LIMIT_MESSAGE_MAX`).
- Si el proxy o WAF de producción ya limita, `RATE_LIMIT_DISABLED=true` desactiva el límite general.

**Correo listo para producción.**
- Conexiones reutilizadas (pool) y ritmo limitado para no superar los topes del proveedor en envíos masivos (`EMAIL_MAX_CONNECTIONS`, `EMAIL_RATE_PER_SECOND`).
- Reintentos automáticos de los errores temporales (4xx, cortes de red), configurables con `EMAIL_MAX_RETRIES`.
- `secure` se deduce del puerto (465: TLS; 587: STARTTLS) y se respetan `EMAIL_FROM` y `EMAIL_REPLY_TO`.

### El campo sexo no se guardaba
**Causa.** El perfil se leía de una vista SQL que no incluía `sexo`. El formulario mostraba «Prefiero no decirlo» y, en el siguiente guardado, borraba el valor.

**Solución.** Nueva vista `vista_socios_perfil` con `sexo` y el resto de campos nuevos, y validación del valor.

### Email profesional no editable
- `socios.email` pasa a ser sólo el **email de acceso**. En el perfil se muestra como sólo lectura, con una explicación.
- El nuevo campo **email profesional** es editable y obligatorio. El email personal sigue siendo opcional.
- El socio elige **en qué email recibe avisos y comunicaciones** (profesional o personal) y **qué email se muestra en su ficha**: ninguno, el profesional o el personal.
- Todas las comunicaciones pasan por una única función (`services/contactEmail.js`): avisos de mensajes, bienvenida, rechazo, confirmación y comunicaciones masivas. Así llegan siempre al email elegido y no al de acceso. La recuperación de contraseña sigue yendo al email de acceso, por seguridad.

### Visibilidad en el directorio y el mapa
- «Mostrar en el directorio» y «Mostrar en el mapa» son ahora las **primeras preguntas del perfil**, con respuesta explícita sí/no. Antes estaban al final y, si fallaba la validación de otros campos más abajo, la elección no llegaba a guardarse.
- La búsqueda del directorio dejaba fuera nombres que sí debían salir: usaba búsqueda de texto completo con raíces en español, y los nombres parciales o escritos con o sin tilde no aparecían. Ahora busca por fragmentos, sin distinguir mayúsculas ni tildes, en nombre, apellidos, entidad, organización, cargo y localidad.
- El mapa público no respetaba la retirada del mapa (`mapa_visible`). Ahora usa el mismo criterio que el mapa privado.

## 2. Usabilidad del formulario de perfil
- Las **decisiones obligatorias** se responden con sí/no y no tienen valor por defecto hasta que el socio las confirma: directorio, mapa, mensajería, email de avisos, avisos por email, email visible, segundo rol, nivel de disponibilidad («No disponible» es una respuesta válida) e intereses de colaboración.
- Los **campos obligatorios** llevan asterisco y hay una leyenda al principio. Un resumen junto al botón de guardar indica en todo momento qué falta; si se intenta guardar, se lleva el foco al primer pendiente.
- El servidor también lo comprueba (`confirmar_preferencias`) y registra la fecha de confirmación (`preferencias_revisadas_at`).
- Mientras haya decisiones pendientes, el panel muestra un aviso con enlace al perfil.

## 3. Mapa y visualización
- **Formato decidido: se combinan las dos opciones.**
  - Mapa privado: nueva vista «Socios por provincia». Cada provincia es una burbuja con el número de socios y un anillo con los colores de cada perfil profesional. Al pasar el cursor se ve el desglose; al pulsar, se filtra esa provincia. En la vista individual, la etiqueta de cada punto incluye el color y el rol.
  - Portada pública: contador en directo de socios, provincias y perfiles, barra de reparto por perfil y mapa por provincias con ranking lateral. Sólo muestra datos agregados: en cada provincia, los perfiles con menos de 3 socios se agrupan en «otros» para que no se pueda identificar a nadie.
- **Landing rediseñada.** Todos los textos siguen siendo editables, con el editor en línea o desde Administración > Landing pública. Hay textos nuevos para el contador, el mapa y los tipos de socio.

## 4. Contenido y configuración
- **Fichas de socio persona física y persona jurídica** (claves `fichas.*`). Se muestran:
  - en el primer acceso, en una ventana que sale una sola vez (`bienvenida_vista_at`);
  - en el registro;
  - en el perfil, con el enlace «¿Qué significa cada tipo?»;
  - en la landing.

  **Los textos actuales son provisionales**: se sustituyen por los de las fichas de Elena desde Administración > Landing pública, sin tocar código.
- **Plantillas de email configurables** en Administración > Plantillas de email:
  - bienvenida, que ya era editable pero no se usaba;
  - confirmación de solicitud (nueva: el solicitante recibe acuse de recibo);
  - rechazo, con una lista de motivos predefinidos editable y la opción de escribir un motivo propio;
  - aviso de mensaje nuevo.

  Todos los valores se escapan.
- **Dominio definitivo `mapadeltalento.agesport.org`**, configurado en la aplicación (URL por defecto), nginx, `.env.example` y la ruta de OpenShift `deploy/openshift/61-route-dominio.yaml`. **Queda pendiente** (operación, fuera del código):
  1. Crear el CNAME en el DNS de agesport.org.
  2. Aplicar la ruta.
  3. Poner `PUBLIC_BASE_URL` y `CORS_ORIGINS` en el secreto de producción.

## 5. Tareas internas
- **Currículums.**
  - Sólo pueden descargarlos el propio socio, la administración y los socios a los que **el titular haya escrito**. Antes bastaba con abrir una conversación enviando un primer mensaje.
  - Al subir un CV se comprueba la firma real del fichero (PDF, DOC o DOCX).
  - Los nombres de fichero son aleatorios de 128 bits.
  - Cada descarga por un tercero queda auditada.
  - La descarga lleva cabeceras restrictivas y nginx nunca sirve `/uploads/cvs` como fichero estático.
  - Corregido además un fallo previo: todas las subidas (fotos y CV) se guardaban con extensión `.bin`.
- **Geolocalización.**
  - Botón «Completar ubicaciones pendientes» en Administración > Mapa: geolocaliza en segundo plano todos los perfiles sin municipio, respetando el límite de Nominatim.
  - Un trigger mantiene sincronizado el punto PostGIS, que nunca se rellenaba y que usa la búsqueda por radio.

## 6. Infraestructura: migración antes del 1 de enero de 2027 (hoja de ruta)
No depende del código. Propuesta:
1. **Decidir el destino** (servidor de Agesport o del gestor) y **quién se encarga del mantenimiento**: actualizaciones de seguridad, copias, renovación TLS y monitorización. Conviene cerrarlo en un contrato o acuerdo de servicio antes de noviembre de 2026.
2. **Requisitos del destino**:
   - Node 22, PostgreSQL 15+ con PostGIS y nginx; o bien un clúster OpenShift o Kubernetes, para el que ya están los manifiestos en `deploy/openshift`.
   - Almacenamiento persistente para `uploads`.
   - Una cuenta SMTP institucional, como `mapadeltalento@agesport.org`.
3. **Ensayo**: restaurar una copia (`scripts/backup.sh`) en el destino, apuntar un subdominio de pruebas y validar con `npm run test:all` y la lista `DEPLOYMENT-CHECKLIST.md`.
4. **Corte**: congelar altas unas horas, hacer una copia final, restaurar, cambiar el DNS de `mapadeltalento.agesport.org` y verificar `/health` (versión y hash del código).
5. **Retirar** el servidor personal tras 30 días con copias verificadas.

## 7. Funcionalidades futuras
- **Panel del histórico de comunicaciones: hecho en esta versión.** Cada envío masivo guarda quién lo envió, el asunto, los filtros y, por destinatario, la provincia, el email usado y el resultado. Se consulta en Administración > Comunicaciones y se puede filtrar por provincia de destino. Endpoints: `GET /api/admin/comunicaciones` (acepta `?admin_id=` y `?provincia=`) y `GET /api/admin/comunicaciones/:id/destinatarios`. **Nota:** hoy no existe la figura de «delegado provincial»; si cada delegado va a tener cuenta de administración limitada a su provincia, hay que definir ese rol (siguiente paso).
- **Envío masivo segmentado.**
  - Hecho en esta versión: nuevo filtro de sector público/privado/tercer sector; envío con pool, ritmo limitado, reintentos y trazabilidad por destinatario.
  - Pendiente: probarlo con volumen real con el proveedor SMTP definitivo (sus límites diarios mandan). Recomendación: un proveedor transaccional (Brevo, Mailgun, Amazon SES…) con SPF, DKIM y DMARC configurados en agesport.org.
- **Pendientes de definición de negocio** (no se han implementado):
  - Alta directa desde la web de Agesport, con datos cifrados y cobro de la cuota integrado. Requiere elegir pasarela (Redsys o Stripe) y acordar la integración con la web actual.
  - Tarifa de acceso para no socios. Requiere definir las tarifas y un tipo de cuenta nuevo con permisos limitados.

## Validación
- Pruebas automáticas: 65 en total (27 unitarias y 38 de integración). De ellas, 9 son nuevas (`test/qa/junta-directiva.test.js`) y cubren:
  - sexo;
  - decisiones obligatorias;
  - email de contacto en avisos y directorio;
  - búsqueda con tildes y fragmentos;
  - visor público agregado;
  - límite por cuenta frente a IP compartida;
  - plantillas de email y escape del motivo;
  - histórico de comunicaciones;
  - validación de CV y primer acceso.
- Se han ajustado dos pruebas existentes a los nuevos criterios: el CV sólo se desbloquea cuando escribe el titular, y se reaplican todas las migraciones desde la 018.
- Comprobación en navegador (Chromium) a 1366 px y 375 px:
  - landing sin desbordamiento horizontal;
  - la ventana de primer acceso sale una sola vez;
  - el perfil bloquea el guardado y lista lo pendiente;
  - tras guardar y recargar, persisten sexo «masculino», email profesional, disponibilidad y mentoría;
  - el mapa privado por provincias muestra el desglose al pasar el cursor.
