# DEPLOY · AGESPORT Mapa del Talento

Guía operativa para desplegar (o actualizar) la plataforma en producción.
Pensada para ser ejecutada por un administrador de sistemas.

**Repo:** `https://github.com/aiprojects-pro/agesport.git`
**Rama a desplegar:** `main`
**Versión de referencia:** `0.4.0` (reconstrucción 2026-06-05)

---

## 1. Pre-requisitos en el servidor

- **Node.js ≥ 20** (probado con 20.x)
- **PostgreSQL 15** con extensiones **PostGIS** y **pgcrypto**
- **PM2** (recomendado) o systemd para gestionar el proceso
- **nginx** (o equivalente) como reverse-proxy + TLS

```bash
# Ejemplo Ubuntu 22.04
sudo apt update
sudo apt install -y postgresql-15 postgresql-15-postgis-3 nginx
sudo systemctl enable --now postgresql
# Node 20 vía NodeSource:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

---

## 2. Clonar el repo

```bash
sudo mkdir -p /var/www && cd /var/www
sudo git clone https://github.com/aiprojects-pro/agesport.git mapa-talento
cd mapa-talento
sudo git checkout main
sudo chown -R $USER:$USER /var/www/mapa-talento
npm ci --omit=dev
mkdir -p logs uploads/foto uploads/cv uploads/landing uploads/logos
```

---

## 3. Crear usuario y base de datos en Postgres

```bash
sudo -u postgres psql <<'SQL'
CREATE USER agesport WITH PASSWORD 'PON_AQUI_LA_PASSWORD';
CREATE DATABASE agesport_mapa_talento OWNER agesport;
\c agesport_mapa_talento
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
GRANT ALL PRIVILEGES ON DATABASE agesport_mapa_talento TO agesport;
SQL
```

> La extensión `postgis` necesita el paquete `postgresql-15-postgis-3` instalado.

---

## 4. Configurar `.env` de producción

```bash
cp .env.example .env
nano .env
```

El servidor **falla al arrancar** (`process.exit(1)`) si alguno de estos no se cambia:

| Variable | Cómo generarla | Por qué bloquea |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` | Cookies de sesión firmadas |
| `ENCRYPTION_KEY` | `openssl rand -hex 16` (= 32 chars) | AES-256-CBC de DNI/teléfono |
| `DB_PASSWORD` | la que pusiste en el paso 3 | Conexión a Postgres |
| `PUBLIC_BASE_URL` | `https://mapatalento.agesport.org` | Enlaces en emails de reset password |
| `ADMIN_INITIAL_PASSWORD` | contraseña fuerte ≥8 chars | Sólo se usa en `npm run db:setup` |

Valores mínimos imprescindibles:

```env
NODE_ENV=production

DB_HOST=localhost
DB_PORT=5432
DB_NAME=agesport_mapa_talento
DB_USER=agesport
DB_PASSWORD=<la-del-paso-3>

JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 16>

ADMIN_INITIAL_EMAIL=admin@agesport.org
ADMIN_INITIAL_PASSWORD=<contraseña-fuerte>

PUBLIC_BASE_URL=https://mapatalento.agesport.org
CORS_ORIGINS=https://mapatalento.agesport.org,https://www.agesport.org

PORT=3001
HOST=127.0.0.1   # nginx hace proxy_pass — NO exponer Node directamente

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@agesport.org
EMAIL_PASS=<app-password>
EMAIL_FROM=AGESPORT Mapa del Talento <noreply@agesport.org>

UPLOADS_PATH=/var/www/mapa-talento/uploads
```

`chmod 600 .env` para que sólo lo lea el usuario que corre Node.

---

## 5. Inicializar la base de datos

### Caso A — instalación nueva

```bash
npm run db:setup
```

Aplica `schema.sql`, corre las 14 migraciones via el runner idempotente,
y crea el admin inicial (`ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD`).

### Caso B — actualización de una versión anterior

```bash
npm run db:migrate
```

Aplica sólo las migraciones pendientes (consulta la tabla `_migrations`).
Es seguro re-ejecutarlo: las ya aplicadas se saltan.

> **Backup primero**: `pg_dump $DB_NAME > backup-$(date +%F).sql`

---

## 6. Arrancar con PM2

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup     # imprime un comando que hay que copiar+pegar para systemd
```

Logs:

```bash
pm2 logs mapa-talento-agesport
pm2 monit
```

Restart limpio tras cambios:

```bash
git pull
npm ci --omit=dev
npm run db:migrate
pm2 restart mapa-talento-agesport
```

---

## 7. Configurar nginx (TLS + reverse proxy)

```nginx
# /etc/nginx/sites-available/mapatalento.agesport.org
server {
    listen 80;
    server_name mapatalento.agesport.org;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mapatalento.agesport.org;

    ssl_certificate     /etc/letsencrypt/live/mapatalento.agesport.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mapatalento.agesport.org/privkey.pem;

    client_max_body_size 10M;     # uploads (CV/foto/logo)

    # Cabeceras de seguridad básicas
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activar:

```bash
sudo ln -s /etc/nginx/sites-available/mapatalento.agesport.org /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# TLS con Let's Encrypt:
sudo certbot --nginx -d mapatalento.agesport.org
```

> El servidor lee `req.ip` confiando en `X-Forwarded-For`. Asegúrate de no
> exponer el puerto 3001 al exterior (firewall: sólo abrir 80/443).

---

## 8. Smoke test post-deploy

```bash
# Health del proceso
curl -fsS https://mapatalento.agesport.org/health

# Landing pública (CMS)
curl -fsS https://mapatalento.agesport.org/api/public/landing | head -c 300

# Login admin
curl -X POST https://mapatalento.agesport.org/api/auth/login/admin \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@agesport.org","password":"<ADMIN_INITIAL_PASSWORD>"}'
# → debe devolver un JWT y user.rol === "superadmin"
```

---

## 9. Backup diario (cron)

```bash
# /etc/cron.d/agesport-backup
0 3 * * * postgres pg_dump agesport_mapa_talento | gzip > /var/backups/agesport/db-$(date +\%Y\%m\%d).sql.gz
0 4 * * 0 root find /var/backups/agesport -name 'db-*.sql.gz' -mtime +30 -delete
```

> Crea `/var/backups/agesport` con permisos para el usuario `postgres` antes.

---

## 10. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `FATAL: refusing to start in production with default values for JWT_SECRET...` | `.env` no tiene los secretos cambiados | Editar `.env` y reiniciar |
| `FATAL: PUBLIC_BASE_URL no es una URL absoluta válida` | falta `https://` en `PUBLIC_BASE_URL` | Editar `.env` |
| `Error conectando a la base de datos` | `DB_PASSWORD`/`DB_USER` no coinciden con Postgres | Re-ejecutar paso 3 o ajustar `.env` |
| Login funciona pero `verify` da 401 | Cookie no llega — falta `proxy_set_header` `Host` y `X-Forwarded-Proto` | Revisar config nginx (paso 7) |
| Emails de reset no llegan | `EMAIL_PASS` mal o SMTP bloqueado | `pm2 logs` para ver el error de nodemailer |
| Migración rompe a mitad | Lock o constraint inesperado | Restaurar backup, mirar `pg_locks`, contactar dev |
| Admin no puede loguearse tras `db:setup` | `ADMIN_INITIAL_PASSWORD` se cambió tras la primera ejecución | `npm run admin:create -- email password nombre` para resetear |

---

## 11. Rollback de emergencia

Cada release es un commit. Para volver a la versión anterior:

```bash
cd /var/www/mapa-talento
git log --oneline -10        # localiza el commit previo estable
git checkout <commit>
npm ci --omit=dev
# (¡ojo!) las migraciones NO se deshacen automáticamente. Si volviste
# a un commit anterior a una migración aplicada, el código es seguro
# porque las migraciones añaden cosas, no las quitan. Excepción: la
# migración 002 dropea `socios.telefono` plain — no hay rollback sin
# restaurar backup.
pm2 restart mapa-talento-agesport
```

Si hace falta rollback de BD (cambios destructivos):

```bash
gunzip -c /var/backups/agesport/db-YYYYMMDD.sql.gz | \
  PGPASSWORD=$DB_PASSWORD psql -h localhost -U agesport agesport_mapa_talento
```

---

## 12. Atajo: `./deploy.sh`

El script `deploy.sh` en la raíz del repo automatiza los pasos 4–6
(verificación + migraciones + arranque PM2) de forma no-interactiva.
Lee `.env` y delega en `npm run db:setup` / `npm run db:migrate` según
detecte BD existente o nueva. Léelo antes de ejecutarlo.

```bash
chmod +x deploy.sh
./deploy.sh
```
