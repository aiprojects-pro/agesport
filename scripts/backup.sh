#!/bin/bash

# ===================================================================
# BACKUP AUTOMÁTICO — MAPA DEL TALENTO AGESPORT
# ===================================================================
# Hace tres cosas:
#   1) Dump de PostgreSQL comprimido (gzip)
#   2) Tarball de la carpeta uploads/ (fotos + CVs)
#   3) Rotación local por RETENTION_DAYS
#   4) Opcional: sincronización off-site con rclone si BACKUP_REMOTE
#      está definido en .env (ej. BACKUP_REMOTE=seafile:mapa-talento/backups)
#
# Instalación como cron nocturno (2:15 AM cada día):
#   crontab -e
#   15 2 * * *  cd /var/www/mapa-talento && ./scripts/backup.sh >> logs/backup.log 2>&1
#
# Instalación como systemd timer alternativa: ver DEPLOY.md.

set -e

# Cargar variables de entorno
if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
else
    echo "❌ Archivo .env no encontrado"
    exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()   { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"; }
ok()    { echo -e "${GREEN}✅${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠️ ${NC} $1"; }
err()   { echo -e "${RED}❌${NC} $1"; }

mkdir -p "$BACKUP_DIR"
log "Iniciando backup del Mapa del Talento AGESPORT..."

# 1) BASE DE DATOS
DB_FILE="$BACKUP_DIR/db-$DATE.sql.gz"
log "Dump de PostgreSQL..."
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --no-owner --no-privileges --clean --if-exists \
    | gzip > "$DB_FILE"
ok "BD: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"

# 2) UPLOADS
UPLOADS_PATH="${UPLOADS_PATH:-./uploads}"
if [ -d "$UPLOADS_PATH" ]; then
    UPLOADS_FILE="$BACKUP_DIR/uploads-$DATE.tar.gz"
    log "Empaquetando uploads/..."
    tar -czf "$UPLOADS_FILE" "$UPLOADS_PATH" 2>/dev/null
    ok "Uploads: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
else
    warn "Directorio uploads no encontrado (esperado en instalación limpia)"
fi

# 3) MANIFIESTO
MANIFEST="$BACKUP_DIR/manifest-$DATE.txt"
{
  echo "AGESPORT · Mapa del Talento · Backup $DATE"
  echo "Servidor: $(hostname)"
  echo "Usuario:  $(whoami)"
  echo "Node:     $(node --version 2>/dev/null || echo n/a)"
  echo ""
  echo "Ficheros generados:"
  ls -la "$BACKUP_DIR"/*-"$DATE".* 2>/dev/null
} > "$MANIFEST"

# 4) ROTACIÓN LOCAL
log "Rotando backups locales (>$RETENTION_DAYS días)..."
find "$BACKUP_DIR" -name "*.sql.gz"  -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "*.tar.gz"  -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name "manifest-*.txt" -mtime +"$RETENTION_DAYS" -delete
ok "Rotación OK"

# 5) SINCRONIZACIÓN OFF-SITE (opcional, requiere rclone configurado)
if [ -n "$BACKUP_REMOTE" ]; then
    if command -v rclone > /dev/null 2>&1; then
        log "Subiendo a remote: $BACKUP_REMOTE"
        if rclone copy "$BACKUP_DIR" "$BACKUP_REMOTE" \
             --include "*-$DATE.*" --transfers 2 --checkers 2 --quiet; then
            ok "Off-site OK · $BACKUP_REMOTE"
        else
            err "Falló la subida off-site (backup local sigue disponible)"
        fi
    else
        warn "BACKUP_REMOTE definido pero rclone no está instalado. Salta off-site."
    fi
fi

log "🎉 Backup completado exitosamente"
echo "📊 Espacio usado por backups: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo ""
echo "Restauración de la BD:"
echo "  gunzip -c $DB_FILE | psql -h \$DB_HOST -U \$DB_USER -d \$DB_NAME"
echo ""
echo "Restauración de uploads:"
echo "  tar -xzf $BACKUP_DIR/uploads-$DATE.tar.gz -C /"
