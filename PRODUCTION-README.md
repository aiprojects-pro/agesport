# AGESPORT · Mapa del Talento — Guía rápida de producción

Este paquete contiene el código completo listo para desplegar. Léase junto con `DEPLOY.md` (procedimiento operativo detallado) y `DEPLOYMENT-CHECKLIST.md` (checklist de smoke tests post-despliegue).

## Requisitos

- **Node.js 20+** (probado con 20.x LTS)
- **PostgreSQL 15+** con extensiones **PostGIS** y **pgcrypto**
- **Nginx** (o equivalente) como reverse-proxy con TLS (Let's Encrypt)
- **PM2** (recomendado) o systemd para gestionar el proceso
- Servidor SMTP accesible (Gmail, SES, Postmark, etc.) para las notificaciones por email

## Despliegue en 5 pasos

### 1) Preparar el servidor

```bash
sudo apt update
sudo apt install -y postgresql-15 postgresql-15-postgis-3 nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

### 2) Subir el código y dependencias

```bash
# Extraer el zip en /var/www/mapa-talento (o donde quieras)
cd /var/www/mapa-talento
npm ci --omit=dev
```

### 3) Configurar `.env`

Copia el template y edítalo:

```bash
cp .env.example .env
```

Variables **obligatorias** que hay que rellenar:

| Variable | Qué es | Cómo generarla |
|---|---|---|
| `DB_PASSWORD` | password del usuario de Postgres | el que definas al crear el usuario |
| `JWT_SECRET` | firma de tokens de sesión | `openssl rand -hex 32` |
| `ENCRYPTION_KEY` | cifra teléfono y DNI en la BD | `openssl rand -hex 16` (32 chars hex) |
| `EMAIL_HOST/USER/PASS` | SMTP para notificaciones | del proveedor (Gmail app-password, SES, etc.) |
| `PUBLIC_BASE_URL` | dominio público con https | ej. `https://mapatalento.agesport.org` |
| `CORS_ORIGINS` | orígenes permitidos, coma-separados | mismo dominio |
| `ADMIN_INITIAL_EMAIL` / `_PASSWORD` | crea el primer admin al ejecutar `db:setup` | elige uno |

### 4) Base de datos

```bash
# En Postgres, crear la BD y el usuario
sudo -u postgres psql -c "CREATE DATABASE agesport_mapa_talento;"
sudo -u postgres psql -c "CREATE USER agesport WITH PASSWORD '<tu-password>';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE agesport_mapa_talento TO agesport;"

# Cargar el esquema, extensiones, migraciones y admin inicial
npm run db:setup      # crea tablas + extensiones (PostGIS, pgcrypto)
npm run db:migrate    # aplica todas las migraciones de database/migrations/
```

### 5) Arrancar el servicio y publicar

```bash
# PM2 (recomendado)
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup      # sigue las instrucciones que muestra
```

Nginx: usar `nginx/mapatalento.conf` como base — hace reverse-proxy a `http://127.0.0.1:3001` y sirve `/uploads/` como estático directo. Certificado TLS con `certbot --nginx -d mapatalento.agesport.org`.

## Backups

Tres cosas que hay que respaldar:

| Qué | Cómo | Frecuencia |
|---|---|---|
| Base de datos | `pg_dump agesport_mapa_talento > backup.sql` | diaria + semanal off-site |
| `./uploads/` (fotos, CVs) | `tar czf uploads.tgz uploads/` o `aws s3 sync` | diaria |
| `.env` y claves | secret manager / vault | al cambiar |

En `deploy.sh` hay un script de ejemplo. `BACKUP_RETENTION_DAYS=30` controla la rotación local.

## Actualización de versión

```bash
cd /var/www/mapa-talento
git pull  # o extraer nueva versión del zip
npm ci --omit=dev
npm run db:migrate
pm2 reload ecosystem.config.js --env production
```

Las migraciones son idempotentes: no dupliquen datos si se re-ejecutan.

## Novedades v10 (sprint de bugs + rediseño landing)

Todos los siguientes cambios ya vienen incluidos en este paquete y son
compatibles con la BD existente en producción (basta con `npm run db:migrate`
para aplicar la migración 015 que añade la columna `socios.sexo`).

**Bugs corregidos**
- Registro como persona jurídica (`asociado_corporativo`): el validador ya no
  exige `cargo_actual` / `anos_experiencia` para cuentas corporativas y sí
  exige `nombre_organizacion`.
- Descarga CSV de socios: dos fallos (columna `telefono` inexistente y shadow
  del módulo `csv`); ahora funciona y el teléfono cifrado se descifra para el
  admin.
- Importación CSV: listener duplicado del "seleccionar todo" que se
  acumulaba con cada preview.
- Reset de contraseña: si un admin lo hacía, la app le mandaba a
  `/acceso.html` (login socio); ahora respeta `?type=admin` y va a
  `/acceso-admin.html`.
- Reset de contraseña: mismo criterio de validación que en el registro
  (min. 8, 1 mayúscula, 1 minúscula, 1 número) — antes aceptaba passwords
  triviales.
- Mensajería: la query `getMensajes` fallaba con "bind message supplies 1
  parameters, but prepared statement requires 2" al abrir cualquier chat.
  Corregido pasando el sentinel de moderación.

**Panel de configuración de correo saliente (nuevo)**
- Nueva pestaña "Correo saliente" en `/admin.html`, sólo superadmin.
- Configura Host / Puerto / TLS / Usuario / Contraseña / Nombre remitente /
  Email remitente / Reply-to sin tocar `.env`.
- La contraseña se cifra AES-256 en la tabla `configuracion`.
- Botón de **prueba de envío** antes de guardar (envía un email de test para
  validar credenciales).
- `emailService` recarga la configuración en caliente al guardar (no hace
  falta reiniciar el servidor).
- Instrucción: crear una cuenta institucional `mapatalento@agesport.org`
  (recomendado no-reply) con el proveedor de correo de AGESPORT y pegar los
  credenciales en el panel.

**Panel del socio — visor del talento**
- Nuevos filtros del mapa: **Rol · Especialidad · Provincia · Limpiar
  filtros**. Combinables con el filtro territorial existente.
- Al seleccionar una provincia, el mapa hace **pan automático al centroide**
  de esa provincia (con las 52 provincias españolas cargadas).
- Nueva sección **"Indicadores del talento"** con 6 gráficos agregados:
  distribución por sexo, delegación provincial (8 provincias andaluzas),
  tipo de socio, ámbito profesional, rango de experiencia y actividad
  reciente.
- Los KPIs y los indicadores respetan todos los filtros activos.

**Perfil profesional**
- Nuevo campo **Sexo (opcional)** — sólo se usa para estadísticas
  agregadas, nunca en la ficha pública.
- Nueva sección **Disponibilidad y colaboración**: nivel + casillas de
  mentor/ponente/asistente/representación/captación de patrocinios/congreso.
- Icono del CV rediseñado (SVG documento verde en cuadrado, misma paleta).
- Foto de perfil placeholder con el mismo formato que el CV.
- Bloque "Visibilidad en el directorio" agrupa los dos toggles (email +
  teléfono) juntos en el margen izquierdo.

**Mensajería interna**
- Ahora el destinatario recibe siempre una copia por email (si tiene
  `acepta_notificaciones_email = true`). Antes dependía de un checkbox del
  emisor.
- Al hacer clic en un punto del mapa se abre un popup con dos botones:
  **Enviar mensaje** (directo a `/mensajes.html?receptor=<id>`) y **Ver
  perfil**. La conversación se crea automáticamente si no existía.
- Endurecimiento RGPD: respuestas 403 uniformes al intentar acceder a
  conversaciones ajenas (no filtra existencia de IDs).

**Ver contraseña (toggle ojo)**
- Añadido en acceso socio, acceso admin, registro, cambio de contraseña y
  restablecimiento. Auto-inyectado por `password-toggle.js`.

**Rediseño de la landing pública**
- Título hero con palabra clave "talento" en cursiva verde con subrayado
  gradiente + ornamentos radiales de fondo.
- Kickers numerados por sección (01 · Proyecto, 02 · Capacidades,
  03 · Implementación, 04 · Acceso).
- Iconografía SVG en las 7 tarjetas de propósito y capacidades.
- Micro-animaciones fade-in al scroll (IntersectionObserver, respetan
  `prefers-reduced-motion`).
- Sección Capacidades con fondo suave verde para dar ritmo visual.

**Editor in-situ de la landing (nuevo)**
- Modo edición sobre la landing real: sólo aparece cuando el visitante
  tiene sesión de administrador.
- Botón flotante "✎ Editar página" en la esquina inferior derecha.
- Todos los bloques `[data-cms]` son editables inline con outline verde y
  badge navy con el nombre de la clave para no confundir cuál se edita.
- Las imágenes tienen overlay "🖼 Cambiar imagen".
- Botón **Guardar cambios (N)** que envía por lote todas las modificaciones
  a los endpoints existentes (`PUT /api/admin/landing/:clave` y
  `POST /api/admin/landing/:clave/imagen`). No duplica lógica de storage.
- Reutiliza la misma tabla `landing_content` que ya usaba el editor plano
  del panel admin; ambos siguen funcionando en paralelo.

## Novedades incluidas en este paquete

- Accesos **socio** y **administración** en páginas separadas (`/acceso.html` y `/acceso-admin.html`).
- Mapa público (`/`): puntos anónimos coloreados por rol; jitter de coordenadas (±500m) para no revelar municipio exacto.
- Mapa intranet (`/panel.html`): marcadores clicables con popup **Enviar mensaje / Ver perfil**, tooltip permanente (toggle nombre/rol).
- KPIs interactivos en el panel: click sobre cualquier KPI abre la lista de socios asociada, filtrable por ámbito territorial.
- Geocodificación automática por localidad + provincia (nivel municipio, nunca calle).
- **Mensajería con notificación por email obligatoria** al destinatario (respetando el consentimiento `acepta_notificaciones_email`).
- Endurecimiento RGPD: respuestas 403 uniformes al intentar acceder a conversaciones ajenas (no filtra existencia de IDs).
- Paleta de roles clúster rediseñada (9 hues WCAG-AA distinguibles).
- CMS de landing editable desde el panel de administración (persistido en tabla `landing_content`).

## Soporte

- Logs de la aplicación: `logs/app.log` (rotación configurable).
- Health check: `GET /health` — devuelve estado de la app y conexión a la BD.
- `DEPLOYMENT-CHECKLIST.md` para verificar el despliegue después de cada release.
