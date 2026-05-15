# AGESPORT — Mapa del Talento v2 · Resumen de cambios

Refactor completo basado en el feedback de Marina sobre la versión inicial. Los cambios se han organizado en 6 bloques (0–5) y abarcan tanto el modelo de datos como la interfaz pública, el área privada del socio, los formularios de alta, la mensajería y el panel de administración.

> **Verificado end-to-end contra PostgreSQL real:** schema base + migración 001 (idempotente) + arranque del servidor + registro + login + actualización completa del perfil + persistencia de especialidades + identidad de organización con multi-color + importación CSV + solicitud y listado de bajas + mensajería multi-receptor. **0 errores en logs.**

---

## Bugs raíz solucionados

### 1. Validación de provincias (causa raíz reportada por Marina)
`middleware/security.js` solo aceptaba las 8 provincias andaluzas en `validateRegistrationData` y `validateProfileData`. Eso causaba el error **"Datos de perfil inválido"** al intentar guardar cualquier cambio desde el perfil, incluso aunque el dato cambiado no fuera la provincia. Ahora las validaciones tiran del catálogo central (`config/catalogos.js`) y aceptan cualquier provincia válida de España. La validación de teléfono también se ha relajado para aceptar formatos internacionales.

### 2. `crypto.createCipher` deprecado (bug pre-existente, detectado durante la verificación)
`middleware/auth.js` usaba `crypto.createCipher` / `createDecipher`, **eliminados en Node.js 17+**. Esto causaba un `500 Error actualizando perfil` cada vez que el socio intentaba guardar el teléfono (porque la API trata el teléfono como dato cifrable). Corregido sustituyéndolo por `createCipheriv` / `createDecipheriv` con AES-256-CBC, IV aleatorio por valor y derivación SHA-256 de la clave para garantizar 32 bytes exactos. Formato de salida: `ivHex:cipherHex`. **Verificado**: el teléfono se cifra correctamente (65 bytes) y se persiste.

### 3. `sanitizeObject` rompía arrays (bug pre-existente, detectado durante la verificación)
El middleware `validateInput` recorría `req.body` con `sanitizeObject`, que **convertía los arrays en objetos planos con claves numéricas** (`["a","b"]` → `{0:"a", 1:"b"}`). Esto rompía silenciosamente `Array.isArray(especialidades)` en los controladores, así que las especialidades nunca se guardaban en `updatePerfil`. Corregido detectando `Array.isArray(obj)` al principio de `sanitizeObject` y mapeando elemento a elemento preservando el tipo array. **Verificado**: las 3 especialidades enviadas en un PUT /perfil ahora se persisten en `socio_especialidades` con `orden_prioridad` 1, 2 y 3.

---

## Bloque 0 · Catálogos y migración

### Nuevos archivos
- **`config/catalogos.js`** — fuente única de verdad backend. Exporta `TIPOS_SOCIO` (5), `ROLES_CLUSTER` (9, con color corporativo y descripción), `ESPECIALIDADES` (15, con descripción), `COMUNIDADES_AUTONOMAS` (17 + Ceuta + Melilla con todas sus provincias). Helpers: `allProvinces()`, `findRolBySlug()`, `findCcaaByProvincia()`, validadores `isValid*`, y mapeos legacy → nuevos slugs.
- **`public/assets/catalogos.js`** — versión browser idéntica, expuesta en `window.AgesportCatalogos`. Incluye helpers de render para selects: `fillProvincesSelect` (con `<optgroup>` por CCAA), `fillRolesSelect`, `fillEspecialidadesSelect`, `fillTiposSocioSelect`.
- **`database/migrations/001_v2_expand_catalogs.sql`** — migración idempotente que:
  - Convierte los enums `rol_cluster_enum` y `especialidad_enum` a `VARCHAR(60)` (necesario porque añadimos valores nuevos al catálogo).
  - Migra los slugs antiguos (`gestion`, `servicios`, `infra`, `tech`) a los nuevos (`operador_deportivo`, etc.).
  - Añade columnas en `socios`: `tipo_socio`, `email_personal`, `email_preferido`, `telefono` (en claro), `foto_url`, `cv_url`, `comunidad_autonoma`, `nombre_organizacion`.
  - Rellena `comunidad_autonoma = 'andalucia'` retroactivamente para socios con provincia andaluza.
  - Crea tablas nuevas: `organizacion_config` (identidad de AGESPORT), `bajas_pendientes` (gestión de solicitudes de baja), `accesos_invitados` (importación masiva por CSV).
  - Recrea las vistas `vista_socios_completos` y `vista_stats_observatorio` con los campos nuevos.
  - Limpia el "32 fantasma": marca como `activo=false, estado=rechazado` los socios huérfanos sin email o nombre (no los borra para preservar auditoría).

### Modificados
- **`middleware/security.js`** — usa `catalogos.isValid*` en las validaciones; teléfono internacional aceptado; **sanitizeObject preserva arrays** (bug 3 arriba).
- **`middleware/auth.js`** — **encriptación migrada a `createCipheriv` AES-256-CBC** (bug 2 arriba).
- **`scripts/seed-database.js`** — usa los slugs nuevos y añade `comunidad_autonoma` + `tipo_socio` en los inserts de ejemplo.

---

## Bloque 1 · Marca, paleta y home pública

### Nuevos archivos
- **`public/assets/agesport-logo.svg`** — logo oficial de AGEsport (copia del SVG corporativo enviado por Marina).
- **`public/assets/mapa-andalucia.svg`** — mapa estilizado de Andalucía con sus 8 provincias como paths separados, viewBox 1000×560, hover-friendly. Cada provincia con su color del clúster.

### Modificados
- **`public/assets/portal.css`** — paleta corporativa nueva:
  - Verdes del logo: `--green-light` (#6da93f), `--green` (#37964f), `--green-mid` (#0f895b), `--green-deep` (#008460).
  - Colores semánticos para los 9 roles del clúster (`--rol-operador`, `--rol-infra`, etc.).
  - Botón primario con gradiente verde→navy.
  - `.site-brand-mark` ahora usa el SVG real (160×44) en lugar del cuadrado simulado.
  - Componentes nuevos: `.rol-chip[data-rol="..."]`, `.photo-uploader`, `.map-card`, `.selectable-list`, `.identity-card`, `.color-swatches`, `.tabs`, `.segmented`.
- **`public/index.html`** — reescrita:
  - Logo real en la cabecera.
  - Hero con mapa SVG de Andalucía (sustituye al `hero-dashboard.png`).
  - Botones explícitos: **"Conocer el proyecto"**, **"Acceso socio"**, **"Acceso administración"** (este último estilo navy, diferenciado).
  - 4 fases reescritas con redacción más clara (ficha → procesamiento → visualización → dinamización del clúster).

---

## Bloque 2 · Panel de socio

### Nuevo
- **`services/uploadService.js`** — gestión centralizada de subidas con multer. Configuradores preconstruidos para `uploadFoto` (3MB, JPG/PNG/WEBP/SVG → `/uploads/fotos`), `uploadCV` (5MB, PDF/DOC/DOCX → `/uploads/cvs`), `uploadLogo` (2MB → `/uploads/logos`), `uploadCSV` (memoria, 5MB). Helpers `toPublicUrl()` y `removeFile()` para gestión segura.

### Modificados — backend
- **`server.js`** — CSP ampliado con `blob:` para previsualización local de fotos. Monta `/uploads` como estático con `maxAge: 7d`. En desarrollo, también sirve `/assets` para que los HTML funcionen sin el reverse-proxy de producción.
- **`controllers/sociosController.js`**:
  - `updatePerfil` ahora acepta: `tipo_socio`, `email_personal`, `email_preferido`, `telefono` (guarda tanto en claro como cifrado), `comunidad_autonoma` (se infiere automáticamente desde la provincia si no llega explícita), `nombre_organizacion`.
  - Nuevos métodos: `uploadFoto`, `uploadCV`, `deleteCV`, `solicitarBaja` (crea fila en `bajas_pendientes`).
- **`routes/socios.js`** — nuevas rutas: `POST /perfil/foto`, `POST /perfil/cv`, `DELETE /perfil/cv`, `POST /solicitar-baja`. Wrapper `wrapMulter` para convertir errores de multer a JSON.

### Modificados — frontend
- **`public/perfil.html`** — reescrita:
  - Carga `/assets/catalogos.js` para poblar selects automáticamente.
  - Photo uploader visual con preview circular.
  - CV uploader con botones "Ver CV" y "Quitar".
  - Select de tipo de socio + campo `nombre_organizacion` que aparece solo si es corporativo.
  - Dos emails (profesional + personal) con selector segmentado del email preferido.
  - Cascada CCAA → provincia.
  - Select de `rol_cluster` con descripción dinámica del rol seleccionado.
  - Especialidades como `selectable-list` con descripción larga visible.
  - Todas las checkboxes de visibilidad (teléfono, email directo, web profesional, LinkedIn).
  - Formulario de solicitud de baja al final.
- **`public/assets/perfil.js`** — reescrita:
  - Usa `AgesportCatalogos` para poblar todos los selects.
  - Cascada CCAA→provincia funcional en ambas direcciones (al elegir provincia se autoselecciona la CCAA).
  - `fillForm` rellena todos los campos nuevos.
  - Subidas con `FormData` y previsualización inmediata.
  - `lockForOtherProfile()` cuando se mira un perfil ajeno: deshabilita todos los campos del formulario, oculta el botón de guardar, atenúa los uploaders y oculta el form de baja. Marina pidió específicamente que se viera claro que no se podía editar.
- **`public/directorio.html`** + **`public/assets/directorio.js`** — reescritos:
  - Filtros: CCAA + provincia (cascada) + rol_cluster + especialidad, todos poblados desde el catálogo.
  - Cards de socio con avatar (foto real o iniciales con gradiente verde si no hay foto).
  - `.rol-chip[data-rol="..."]` coloreado según el rol del clúster.
  - Lee `?provincia=` desde URL al cargar (para que el click en el mapa del panel funcione).
  - Filtra los residuos sin email/nombre (defensa adicional contra el "32 fantasma").
- **`public/panel.html`** + **`public/assets/panel.js`** — reescritos:
  - KPIs ampliados con tarjeta destacada (`.metric.highlight`).
  - Filtro segmentado territorial: **Toda Andalucía** / **Oriental** / **Occidental** / **Todo el territorio nacional**. Aplica al mapa (atenúa provincias fuera del scope) y a los KPIs.
  - Mapa SVG cargado por fetch dentro de `.map-card`. Cada provincia es clicable y lleva a `/directorio.html?provincia=X`.
  - Leyenda con los 9 roles del clúster con sus colores.
  - Resumen del observatorio (top 3 especialidades) y de mensajería (conversaciones, mensajes este mes, no leídos).
- **`public/acceso.html`** y **`public/mensajes.html`** — `.site-brand` actualizado para usar el logo SVG real.

---

## Bloque 5 · Formularios de alta

### Modificados
- **`public/registro.html`** — reescrita:
  - Toggle visual de tipo de socio con dos `.type-card` (verde corporativo): **Persona física (socio/a de número)** vs **Persona jurídica (asociado corporativo)**.
  - Secciones `.campo-fisica` y `.campo-corp` que se muestran/ocultan dinámicamente.
  - Labels adaptativos: "Cargo actual" → "Persona de contacto: cargo" en modo corporativo.
  - Cascada CCAA → provincia.
  - Roles como `.rol-card` con radio button + descripción larga + indicador de color del rol.
  - Especialidades como `.esp-row` con checkbox + descripción.
  - Consentimientos RGPD explícitos.
- **`public/assets/register.js`** — reescrita:
  - `applyTipo(tipo)` cambia campos visibles y labels.
  - Payload diferente según tipo: para corporativos usa `persona_contacto`/`persona_contacto_apellidos` como nombre/apellidos de la cuenta + `nombre_organizacion`.
  - Submit funcional con feedback (la versión anterior tenía bug en el envío).
  - Reset visual al confirmar (limpia chips, deselecciona cards).
- **`controllers/authController.js`** — `register()` acepta y persiste todos los campos nuevos. INSERT ampliado a 26 columnas. Auto-inferencia de CCAA desde provincia si no llega explícita. `telefono` guardado tanto en claro como cifrado.

---

## Bloque 4 · Mensajería

### Modificados — backend
- **`controllers/mensajeriaController.js`**:
  - Nuevo método `enviarMensajeMulti` — acepta `receptorIds` (array), `contenido`, `notificarPorEmail`. Crea conversaciones uno-a-uno con cada receptor, envía emails si están consentidos, y devuelve `{ enviados, total, resultados }` con el detalle por destinatario (ok / error / no acepta mensajes).
  - `enviarMensaje` ahora respeta el flag `notificarPorEmail` enviado por el cliente (antes notificaba siempre).
  - Bind explícito de `enviarMensajeMulti` en el constructor.
- **`routes/mensajeria.js`** — nueva ruta `POST /mensajes/multi` con los mismos middlewares (auth, rate-limit, validación).

### Modificados — frontend
- **`public/mensajes.html`** — reescrita:
  - Búsqueda en la lista de conversaciones (`#convSearch`).
  - Avatar circular con iniciales con gradiente verde.
  - Badge de no leídos por conversación + contador agregado en cabecera.
  - Botón **"Nuevo mensaje"** que abre el composer multi-receptor.
  - Composer con `.compose-chips` (destinatarios añadidos como chips removibles) + buscador con autocomplete sobre el directorio + checkbox `composeEmail` para notificación adicional por email.
  - En el form individual de la conversación activa: checkbox `notifyEmail` para decidir por mensaje si se notifica.
- **`public/assets/mensajes.js`** — reescrita:
  - `renderConversations(filter)` filtra por texto y muestra contador de no leídos.
  - `ensureConversation()` auto-abre la conversación cuando vienes desde `?receptor=` (desde directorio o perfil).
  - Composer multi: precarga el directorio (`/api/socios/directorio?limit=200`), busca dinámicamente, chips removibles, envío a `/api/mensajeria/mensajes/multi`.

---

## Bloque 3 · Panel de administración

### Modificados — backend
- **`controllers/adminController.js`** (ampliado con métodos v2):
  - **Identidad organización**: `getOrganizacion`, `updateOrganizacion` (nombre, tipo, provincia, CCAA, web, descripción, email_remitente, colores como JSONB), `uploadOrganizacionLogo` (multer + sustitución del logo anterior).
  - **Bajas**: `getBajasPendientes` (lista con datos del socio), `gestionarBaja` (acciones: `aprobar`, `rechazar`, `marcar_revision`, `guardar_notas`; soporta `llamada_realizada` y `notas_admin`). Al aprobar la baja, hace soft-delete del socio.
  - **Importación CSV**: `descargarPlantillaCSV` (devuelve template), `importarCSV` (parsea, valida cada fila contra el catálogo, marca duplicados por email, guarda en `accesos_invitados` con `lote_id` único), `getAccesosInvitados` (filtros por lote y estado), `aprobarAccesoInvitado` (crea socio aprobado con contraseña temporal y dispara email de bienvenida).
  - **Accesos generados**: `getAccesosGenerados` — listado de socios activos ordenado por último acceso (los más recientes primero).
  - **Exportación CSV de contactos** *(añadido por petición de Marina)*: `exportarSociosCSV` devuelve un CSV completo con 33 columnas — identidad (id, emails, tipo de socio, organización), datos profesionales (entidad, cargo, años, teléfono, web, LinkedIn), localización (provincia, CCAA, localidad, código postal, ámbito), estado y fechas, rol del clúster con flags B2B, disponibilidad, especialidades agregadas con `string_agg`, y consentimientos (mensajería, notificaciones, visibilidad). Soporta filtro `?estado=aprobado|pendiente|rechazado|suspendido` (sin filtro = todos los activos). Encoding UTF-8 con BOM para que Excel y Numbers respeten acentos. Etiquetas legibles (no slugs) en rol, tipo de socio, CCAA y especialidades. Auditoría registrada en cada exportación.
  - Corregido bug heredado: query usaba `especialidad_enum[]` que la migración elimina; ahora usa `VARCHAR[]`.
- **`routes/admin.js`** — nuevas rutas v2:
  - `GET/PUT /organizacion`, `POST /organizacion/logo`.
  - `GET /bajas`, `POST /bajas/:bajaId/gestionar`.
  - `GET /socios/plantilla-csv`, `POST /socios/importar`, `GET /socios/invitados`, `POST /socios/invitados/:invitadoId/aprobar`.
  - `GET /socios/accesos`.
  - `GET /socios/exportar` — **exportación CSV con auditoría y filtros opcionales por estado**.
- **`services/emailService.js`** — añadido `sendAccountApproved(socio, { passwordTemporal, adminNombre })` para los socios creados desde importación masiva. HTML + texto plano con enlace al portal.

### Modificados — frontend
- **`public/admin.html`** — reescrita con estructura por pestañas (`.tabs` + `.tab-panel`):
  - **Dashboard**: KPIs (socios activos, pendientes, mensajes último mes, conversaciones activas), top provincias, top especialidades, actividad reciente.
  - **Identidad organización**: formulario con todos los campos + multi-color editor (`.color-swatches` con varios `input[type=color]` y botón "+") + uploader de logo con preview.
  - **Pendientes**: tabla con checkboxes `.selectable-row` + botón "Aprobar seleccionados" (loop sobre el endpoint individual con notificación por email) + botón individual de rechazo por fila.
  - **Accesos generados**: tabla de socios aprobados activos ordenada por último acceso, **selector de filtro por estado y botón "Descargar contactos (CSV)"** que dispara la exportación con el filtro seleccionado.
  - **Bajas**: cada solicitud como card con checkbox de llamada realizada, textarea de notas internas, y tres botones (guardar notas / rechazar / aprobar).
  - **Importación masiva**: botón de descarga de plantilla CSV, uploader, vista previa con checkboxes y duplicados marcados, botón "Aprobar seleccionados y enviar acceso".
- **`public/assets/admin-dashboard.js`** — reescrita completamente con toda la lógica de pestañas (carga lazy: los datos de cada pestaña se cargan al abrirla por primera vez; el botón "Actualizar datos" invalida la caché). **Handler de exportación CSV implementado con `fetch + blob + URL.createObjectURL`** para preservar la autenticación por cookie httpOnly y forzar el nombre de fichero desde el header `Content-Disposition`.

---

## Verificación realizada (resumen)

### Backend + flujos (contra PostgreSQL 16 + PostGIS real)

```
1. REGISTRO Barcelona (no andaluza):  OK — socio creado, 2 especialidades persistidas
2. UPDATE PERFIL → Madrid:             OK — provincia, CCAA, teléfono cifrado,
                                        email_personal, email_preferido, rol_cluster
                                        y 3 especialidades persistidas
3. IDENTIDAD ORGANIZACIÓN (PUT):       OK — 4 colores corporativos guardados (JSONB)
4. IMPORTACIÓN CSV:                    OK — 2 filas validadas, slugs correctos
5. SOLICITUD BAJA:                     OK — registrada y visible en /api/admin/bajas
6. MENSAJERÍA multi-receptor:          OK — enviados: 1/1
7. EXPORTACIÓN CSV de contactos:       OK — 33 columnas, BOM UTF-8 (acentos OK),
                                        etiquetas legibles, quoting RFC 4180,
                                        filtros por estado, auditado en BD,
                                        401 sin auth
8. ERRORES EN LOGS:                    0
```

### Frontend (jsdom ejecutando el JS real)

Cada HTML se carga con un DOM completo, se ejecutan todos los `<script>` (catalogos.js, portal.js, y el específico de cada página) y se mide el DOM resultante.

```
Públicas:
  ✓ GET /                  Mapa del Talento AGESPORT
  ✓ GET /acceso.html        AGESPORT · Acceso
  ✓ GET /registro.html      cataloges 5/9/15/19 + 20 CCAA + 53 prov +
                             9 rol-cards + 15 esp-rows + 2 type-cards +
                             cascada CCAA→provincia operativa

Privadas socio (login real):
  ✓ GET /panel.html         catálogos cargan, mapa SVG embebido
  ✓ GET /perfil.html        20 CCAA, 6 tipos socio, 10 roles, 15 esp
  ✓ GET /directorio.html    catálogos cargan
  ✓ GET /mensajes.html      catálogos cargan

Privadas admin (login real):
  ✓ GET /admin.html         6 tabs (Dashboard, Identidad, Pendientes,
                             Accesos generados, Bajas, Importación masiva)
                             botón "Descargar contactos (CSV)" presente
                             selector de filtro por estado presente

Errores JavaScript runtime: 0
```

### Email saliente (SMTP catcher local)

Se levantó un servidor SMTP de captura en `127.0.0.1:2525` configurando `EMAIL_HOST=127.0.0.1` y `EMAIL_PORT=2525` en `.env`. El servidor de AGESPORT inicializó correctamente el transporter de nodemailer.

```
1. POST /api/auth/register (socio nuevo)
   → ✓ Email a admin@test.com (2993 bytes, multipart HTML+texto)
     Asunto: [AGESPORT] Nuevo registro pendiente: Pepe Test

2. POST /api/admin/socios/2/aprobar (admin aprueba al nuevo)
   → ✓ Email al socio aprobado (3749 bytes)
     Asunto: ¡Bienvenido al Mapa del Talento de AGESPORT!

3. POST /api/mensajeria/mensajes (socio_1 → socio_2 con notificarPorEmail=true)
   → ✓ Email al receptor (3402 bytes)
     Asunto: Nuevo mensaje de Test - AGESPORT

Total: 3 / 3 emails entregados correctamente al SMTP. Content-Type multipart/alternative
con cuerpo HTML + texto plano. Encoding UTF-8 (acentos OK).
```

**Variables de entorno que tu administrador debe configurar en producción:**
- `EMAIL_HOST` — host SMTP del proveedor de correo
- `EMAIL_PORT` — habitualmente 587 (TLS) o 465 (SSL)
- `EMAIL_USER` — cuenta autenticada
- `EMAIL_PASS` — contraseña o token de aplicación

Si están vacías o con valores placeholder (`your_email_password`, `tu_password_email`, `noreply@agesport.org`), el servidor **arranca igual** pero el transporter queda en `null` y todos los `sendEmail()` registran `📧 Email no configurado, simulando envío` en logs sin enviar nada. Las notificaciones (nuevo registro, aprobación, mensaje recibido, baja) quedan inertes hasta que se configure correctamente.

---

## Cómo aplicar los cambios

1. **Backup de la base de datos** (recomendado antes de cualquier migración).
2. **Ejecutar la migración**:
   ```bash
   psql $DATABASE_URL -f database/migrations/001_v2_expand_catalogs.sql
   ```
3. **Crear las carpetas de uploads** (el `uploadService` las crea automáticamente al arrancar, pero si en producción el proceso no tiene permisos de escritura conviene crearlas a mano):
   ```bash
   mkdir -p uploads/fotos uploads/cvs uploads/logos
   chown -R node:node uploads/
   ```
4. **Reiniciar el servicio** (`pm2 restart agesport` o equivalente).
5. **Verificar** desde `https://agesport.aiprojects.pro/` que:
   - El nuevo home muestra el logo y el mapa de Andalucía.
   - Acceso socio / Acceso administración llevan a los formularios correctos.
   - Desde el perfil se puede guardar cambios sin el error "Datos de perfil inválido".
   - Desde el admin se pueden gestionar identidad, pendientes, bajas e importación.

### Nota sobre datos cifrados existentes
El cambio de cifrado (bug 2) implica que los teléfonos / DNI que ya estuvieran almacenados en `telefono_encrypted` / `dni_nie_encrypted` con el algoritmo antiguo (`createCipher`) **no podrán descifrarse** con el nuevo (`createCipheriv` necesita IV). Si en producción hay datos heredados:

- Opción A (recomendada): los usuarios al actualizar el teléfono desde el perfil sobrescriben el valor con el cifrado nuevo. La pantalla del perfil seguirá funcionando porque ya hay también una columna `telefono` en claro (añadida por la migración) que se rellena en cada update.
- Opción B: vaciar masivamente las columnas heredadas con `UPDATE socios SET telefono_encrypted=NULL, dni_nie_encrypted=NULL;` antes de desplegar.

---

## Notas técnicas

- **Catálogos centralizados**: para añadir un nuevo rol, especialidad, CCAA o tipo de socio basta con editar dos archivos (`config/catalogos.js` y `public/assets/catalogos.js`) y desplegar. No requiere migración SQL.
- **Idempotencia**: la migración 001 usa `IF NOT EXISTS`, `IF EXISTS`, conversiones seguras con `USING ... ::TEXT` y `WHERE` defensivos. Es seguro re-ejecutarla. **Verificado** ejecutándola dos veces consecutivas sin errores.
- **Compatibilidad**: el código sigue aceptando los slugs antiguos en BD (los mapea via `LEGACY_ROL_MAP` / `LEGACY_ESPECIALIDAD_MAP`), pero ya no los emite.
- **Privacidad**: el filtro `filterSensitiveData(socio, viewerIsOwner, viewerIsAdmin)` sigue aplicando como antes; los campos nuevos respetan los consentimientos `visible_telefono`, `visible_email_directo`, etc.
- **Validación de subidas**: tamaños máximos en `uploadService` (foto 3MB, CV 5MB, logo 2MB, CSV 5MB) y tipos MIME estrictos. El `removeFile` solo borra ficheros dentro de `UPLOADS_ROOT` (defensa contra path traversal).
- **Auditoría**: todas las acciones administrativas (aprobar socio, aprobar invitado, gestionar baja, actualizar organización, subir logo) llaman a `auditAction` y quedan registradas en la tabla `auditoria`.

---

## Archivos modificados (resumen)

```
NUEVOS
├── config/catalogos.js
├── database/migrations/001_v2_expand_catalogs.sql
├── public/assets/catalogos.js
├── public/assets/agesport-logo.svg
├── public/assets/mapa-andalucia.svg
└── services/uploadService.js

MODIFICADOS — Backend
├── controllers/adminController.js
├── controllers/authController.js
├── controllers/mensajeriaController.js
├── controllers/sociosController.js
├── middleware/auth.js              ← bug 2: encriptación createCipheriv
├── middleware/security.js          ← bug 1 (provincias) y bug 3 (arrays)
├── routes/admin.js
├── routes/mensajeria.js
├── routes/socios.js
├── scripts/seed-database.js
├── server.js
├── services/emailService.js
└── database/schema.sql (correcciones menores)

REESCRITOS — Frontend
├── public/admin.html
├── public/directorio.html
├── public/index.html
├── public/mensajes.html
├── public/panel.html
├── public/perfil.html
├── public/registro.html
├── public/assets/admin-dashboard.js
├── public/assets/directorio.js
├── public/assets/mensajes.js
├── public/assets/panel.js
├── public/assets/perfil.js
├── public/assets/portal.css
└── public/assets/register.js

ACTUALIZADOS (solo logo)
├── public/acceso.html
└── public/mensajes.html
```


---

## Bloque 0 · Catálogos y migración

### Nuevos archivos
- **`config/catalogos.js`** — fuente única de verdad backend. Exporta `TIPOS_SOCIO` (5), `ROLES_CLUSTER` (9, con color corporativo y descripción), `ESPECIALIDADES` (15, con descripción), `COMUNIDADES_AUTONOMAS` (17 + Ceuta + Melilla con todas sus provincias). Helpers: `allProvinces()`, `findRolBySlug()`, `findCcaaByProvincia()`, validadores `isValid*`, y mapeos legacy → nuevos slugs.
- **`public/assets/catalogos.js`** — versión browser idéntica, expuesta en `window.AgesportCatalogos`. Incluye helpers de render para selects: `fillProvincesSelect` (con `<optgroup>` por CCAA), `fillRolesSelect`, `fillEspecialidadesSelect`, `fillTiposSocioSelect`.
- **`database/migrations/001_v2_expand_catalogs.sql`** — migración idempotente que:
  - Convierte los enums `rol_cluster_enum` y `especialidad_enum` a `VARCHAR(60)` (necesario porque añadimos valores nuevos al catálogo).
  - Migra los slugs antiguos (`gestion`, `servicios`, `infra`, `tech`) a los nuevos (`operador_deportivo`, etc.).
  - Añade columnas en `socios`: `tipo_socio`, `email_personal`, `email_preferido`, `telefono` (en claro), `foto_url`, `cv_url`, `comunidad_autonoma`, `nombre_organizacion`.
  - Rellena `comunidad_autonoma = 'andalucia'` retroactivamente para socios con provincia andaluza.
  - Crea tablas nuevas: `organizacion_config` (identidad de AGESPORT), `bajas_pendientes` (gestión de solicitudes de baja), `accesos_invitados` (importación masiva por CSV).
  - Recrea las vistas `vista_socios_completos` y `vista_stats_observatorio` con los campos nuevos.
  - Limpia el "32 fantasma": marca como `activo=false, estado=rechazado` los socios huérfanos sin email o nombre (no los borra para preservar auditoría).

### Modificados
- **`middleware/security.js`** — usa `catalogos.isValid*` en las validaciones; teléfono internacional aceptado.
- **`scripts/seed-database.js`** — usa los slugs nuevos y añade `comunidad_autonoma` + `tipo_socio` en los inserts de ejemplo.

---

## Bloque 1 · Marca, paleta y home pública

### Nuevos archivos
- **`public/assets/agesport-logo.svg`** — logo oficial de AGEsport (copia del SVG corporativo enviado por Marina).
- **`public/assets/mapa-andalucia.svg`** — mapa estilizado de Andalucía con sus 8 provincias como paths separados, viewBox 1000×560, hover-friendly. Cada provincia con su color del clúster.

### Modificados
- **`public/assets/portal.css`** — paleta corporativa nueva:
  - Verdes del logo: `--green-light` (#6da93f), `--green` (#37964f), `--green-mid` (#0f895b), `--green-deep` (#008460).
  - Colores semánticos para los 9 roles del clúster (`--rol-operador`, `--rol-infra`, etc.).
  - Botón primario con gradiente verde→navy.
  - `.site-brand-mark` ahora usa el SVG real (160×44) en lugar del cuadrado simulado.
  - Componentes nuevos: `.rol-chip[data-rol="..."]`, `.photo-uploader`, `.map-card`, `.selectable-list`, `.identity-card`, `.color-swatches`, `.tabs`, `.segmented`.
- **`public/index.html`** — reescrita:
  - Logo real en la cabecera.
  - Hero con mapa SVG de Andalucía (sustituye al `hero-dashboard.png`).
  - Botones explícitos: **"Conocer el proyecto"**, **"Acceso socio"**, **"Acceso administración"** (este último estilo navy, diferenciado).
  - 4 fases reescritas con redacción más clara (ficha → procesamiento → visualización → dinamización del clúster).

---

## Bloque 2 · Panel de socio

### Nuevo
- **`services/uploadService.js`** — gestión centralizada de subidas con multer. Configuradores preconstruidos para `uploadFoto` (3MB, JPG/PNG/WEBP/SVG → `/uploads/fotos`), `uploadCV` (5MB, PDF/DOC/DOCX → `/uploads/cvs`), `uploadLogo` (2MB → `/uploads/logos`), `uploadCSV` (memoria, 5MB). Helpers `toPublicUrl()` y `removeFile()` para gestión segura.

### Modificados — backend
- **`server.js`** — CSP ampliado con `blob:` para previsualización local de fotos. Monta `/uploads` como estático con `maxAge: 7d`. En desarrollo, también sirve `/assets` para que los HTML funcionen sin el reverse-proxy de producción.
- **`controllers/sociosController.js`**:
  - `updatePerfil` ahora acepta: `tipo_socio`, `email_personal`, `email_preferido`, `telefono` (guarda tanto en claro como cifrado), `comunidad_autonoma` (se infiere automáticamente desde la provincia si no llega explícita), `nombre_organizacion`.
  - Nuevos métodos: `uploadFoto`, `uploadCV`, `deleteCV`, `solicitarBaja` (crea fila en `bajas_pendientes`).
- **`routes/socios.js`** — nuevas rutas: `POST /perfil/foto`, `POST /perfil/cv`, `DELETE /perfil/cv`, `POST /solicitar-baja`. Wrapper `wrapMulter` para convertir errores de multer a JSON.

### Modificados — frontend
- **`public/perfil.html`** — reescrita:
  - Carga `/assets/catalogos.js` para poblar selects automáticamente.
  - Photo uploader visual con preview circular.
  - CV uploader con botones "Ver CV" y "Quitar".
  - Select de tipo de socio + campo `nombre_organizacion` que aparece solo si es corporativo.
  - Dos emails (profesional + personal) con selector segmentado del email preferido.
  - Cascada CCAA → provincia.
  - Select de `rol_cluster` con descripción dinámica del rol seleccionado.
  - Especialidades como `selectable-list` con descripción larga visible.
  - Todas las checkboxes de visibilidad (teléfono, email directo, web profesional, LinkedIn).
  - Formulario de solicitud de baja al final.
- **`public/assets/perfil.js`** — reescrita:
  - Usa `AgesportCatalogos` para poblar todos los selects.
  - Cascada CCAA→provincia funcional en ambas direcciones (al elegir provincia se autoselecciona la CCAA).
  - `fillForm` rellena todos los campos nuevos.
  - Subidas con `FormData` y previsualización inmediata.
  - `lockForOtherProfile()` cuando se mira un perfil ajeno: deshabilita todos los campos del formulario, oculta el botón de guardar, atenúa los uploaders y oculta el form de baja. Marina pidió específicamente que se viera claro que no se podía editar.
- **`public/directorio.html`** + **`public/assets/directorio.js`** — reescritos:
  - Filtros: CCAA + provincia (cascada) + rol_cluster + especialidad, todos poblados desde el catálogo.
  - Cards de socio con avatar (foto real o iniciales con gradiente verde si no hay foto).
  - `.rol-chip[data-rol="..."]` coloreado según el rol del clúster.
  - Lee `?provincia=` desde URL al cargar (para que el click en el mapa del panel funcione).
  - Filtra los residuos sin email/nombre (defensa adicional contra el "32 fantasma").
- **`public/panel.html`** + **`public/assets/panel.js`** — reescritos:
  - KPIs ampliados con tarjeta destacada (`.metric.highlight`).
  - Filtro segmentado territorial: **Toda Andalucía** / **Oriental** / **Occidental** / **Todo el territorio nacional**. Aplica al mapa (atenúa provincias fuera del scope) y a los KPIs.
  - Mapa SVG cargado por fetch dentro de `.map-card`. Cada provincia es clicable y lleva a `/directorio.html?provincia=X`.
  - Leyenda con los 9 roles del clúster con sus colores.
  - Resumen del observatorio (top 3 especialidades) y de mensajería (conversaciones, mensajes este mes, no leídos).
- **`public/acceso.html`** y **`public/mensajes.html`** — `.site-brand` actualizado para usar el logo SVG real.

---

## Bloque 5 · Formularios de alta

### Modificados
- **`public/registro.html`** — reescrita:
  - Toggle visual de tipo de socio con dos `.type-card` (verde corporativo): **Persona física (socio/a de número)** vs **Persona jurídica (asociado corporativo)**.
  - Secciones `.campo-fisica` y `.campo-corp` que se muestran/ocultan dinámicamente.
  - Labels adaptativos: "Cargo actual" → "Persona de contacto: cargo" en modo corporativo.
  - Cascada CCAA → provincia.
  - Roles como `.rol-card` con radio button + descripción larga + indicador de color del rol.
  - Especialidades como `.esp-row` con checkbox + descripción.
  - Consentimientos RGPD explícitos.
- **`public/assets/register.js`** — reescrita:
  - `applyTipo(tipo)` cambia campos visibles y labels.
  - Payload diferente según tipo: para corporativos usa `persona_contacto`/`persona_contacto_apellidos` como nombre/apellidos de la cuenta + `nombre_organizacion`.
  - Submit funcional con feedback (la versión anterior tenía bug en el envío).
  - Reset visual al confirmar (limpia chips, deselecciona cards).
- **`controllers/authController.js`** — `register()` acepta y persiste todos los campos nuevos. INSERT ampliado a 26 columnas. Auto-inferencia de CCAA desde provincia si no llega explícita. `telefono` guardado tanto en claro como cifrado.

---

## Bloque 4 · Mensajería

### Modificados — backend
- **`controllers/mensajeriaController.js`**:
  - Nuevo método `enviarMensajeMulti` — acepta `receptorIds` (array), `contenido`, `notificarPorEmail`. Crea conversaciones uno-a-uno con cada receptor, envía emails si están consentidos, y devuelve `{ enviados, total, resultados }` con el detalle por destinatario (ok / error / no acepta mensajes).
  - `enviarMensaje` ahora respeta el flag `notificarPorEmail` enviado por el cliente (antes notificaba siempre).
  - Bind explícito de `enviarMensajeMulti` en el constructor.
- **`routes/mensajeria.js`** — nueva ruta `POST /mensajes/multi` con los mismos middlewares (auth, rate-limit, validación).

### Modificados — frontend
- **`public/mensajes.html`** — reescrita:
  - Búsqueda en la lista de conversaciones (`#convSearch`).
  - Avatar circular con iniciales con gradiente verde.
  - Badge de no leídos por conversación + contador agregado en cabecera.
  - Botón **"Nuevo mensaje"** que abre el composer multi-receptor.
  - Composer con `.compose-chips` (destinatarios añadidos como chips removibles) + buscador con autocomplete sobre el directorio + checkbox `composeEmail` para notificación adicional por email.
  - En el form individual de la conversación activa: checkbox `notifyEmail` para decidir por mensaje si se notifica.
- **`public/assets/mensajes.js`** — reescrita:
  - `renderConversations(filter)` filtra por texto y muestra contador de no leídos.
  - `ensureConversation()` auto-abre la conversación cuando vienes desde `?receptor=` (desde directorio o perfil).
  - Composer multi: precarga el directorio (`/api/socios/directorio?limit=200`), busca dinámicamente, chips removibles, envío a `/api/mensajeria/mensajes/multi`.


## Cómo aplicar los cambios

1. **Backup de la base de datos** (recomendado antes de cualquier migración).
2. **Ejecutar la migración**:
   ```bash
   psql $DATABASE_URL -f database/migrations/001_v2_expand_catalogs.sql
   ```
3. **Crear las carpetas de uploads** (el `uploadService` las crea automáticamente al arrancar, pero si en producción el proceso no tiene permisos de escritura conviene crearlas a mano):
   ```bash
   mkdir -p uploads/fotos uploads/cvs uploads/logos
   chown -R node:node uploads/
   ```
4. **Reiniciar el servicio** (`pm2 restart agesport` o equivalente).
5. **Verificar** desde `https://agesport.aiprojects.pro/` que:
   - El nuevo home muestra el logo y el mapa de Andalucía.
   - Acceso socio / Acceso administración llevan a los formularios correctos.
   - Desde el perfil se puede guardar cambios sin el error "Datos de perfil inválido".
   - Desde el admin se pueden gestionar identidad, pendientes, bajas e importación.

---

## Notas técnicas

- **Catálogos centralizados**: para añadir un nuevo rol, especialidad, CCAA o tipo de socio basta con editar dos archivos (`config/catalogos.js` y `public/assets/catalogos.js`) y desplegar. No requiere migración SQL.
- **Idempotencia**: la migración 001 usa `IF NOT EXISTS`, `IF EXISTS`, conversiones seguras con `USING ... ::TEXT` y `WHERE` defensivos. Es seguro re-ejecutarla.
- **Compatibilidad**: el código sigue aceptando los slugs antiguos en BD (los mapea via `LEGACY_ROL_MAP` / `LEGACY_ESPECIALIDAD_MAP`), pero ya no los emite.
- **Privacidad**: el filtro `filterSensitiveData(socio, viewerIsOwner, viewerIsAdmin)` sigue aplicando como antes; los campos nuevos respetan los consentimientos `visible_telefono`, `visible_email_directo`, etc.
- **Validación de subidas**: tamaños máximos en `uploadService` (foto 3MB, CV 5MB, logo 2MB, CSV 5MB) y tipos MIME estrictos. El `removeFile` solo borra ficheros dentro de `UPLOADS_ROOT` (defensa contra path traversal).
- **Auditoría**: todas las acciones administrativas (aprobar socio, aprobar invitado, gestionar baja, actualizar organización, subir logo) llaman a `auditAction` y quedan registradas en la tabla `auditoria`.

---

## Archivos modificados (resumen)

```
NUEVOS
├── config/catalogos.js
├── database/migrations/001_v2_expand_catalogs.sql
├── public/assets/catalogos.js
├── public/assets/agesport-logo.svg
├── public/assets/mapa-andalucia.svg
└── services/uploadService.js

MODIFICADOS — Backend
├── controllers/adminController.js
├── controllers/authController.js
├── controllers/mensajeriaController.js
├── controllers/sociosController.js
├── middleware/security.js
├── routes/admin.js
├── routes/mensajeria.js
├── routes/socios.js
├── scripts/seed-database.js
├── server.js
├── services/emailService.js
└── database/schema.sql (corrección menor)

REESCRITOS — Frontend
├── public/admin.html
├── public/directorio.html
├── public/index.html
├── public/mensajes.html
├── public/panel.html
├── public/perfil.html
├── public/registro.html
├── public/assets/admin-dashboard.js
├── public/assets/directorio.js
├── public/assets/mensajes.js
├── public/assets/panel.js
├── public/assets/perfil.js
├── public/assets/portal.css
└── public/assets/register.js

ACTUALIZADOS (solo logo)
├── public/acceso.html
└── public/mensajes.html
```
