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
