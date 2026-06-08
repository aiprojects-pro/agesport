#!/bin/bash

# ===================================================================
# SCRIPT DE BACKUP AUTOMATIZADO - MAPA DEL TALENTO AGESPORT
# ===================================================================
# Este script realiza backups de la base de datos y archivos

set -e  # Salir si cualquier comando falla

# Cargar variables de entorno
if [ -f .env ]; then
    source .env
else
    echo "❌ Archivo .env no encontrado"
    exit 1
fi

# Configuración
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=30

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[BACKUP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Crear directorio de backup si no existe
mkdir -p "$BACKUP_DIR"

print_status "Iniciando backup del Mapa del Talento AGESPORT..."

# ===================================================================
# 1. BACKUP DE BASE DE DATOS
# ===================================================================

print_status "Realizando backup de base de datos..."

DB_BACKUP_FILE="$BACKUP_DIR/db-$DATE.sql"
DB_COMPRESSED_FILE="$BACKUP_DIR/db-$DATE.sql.gz"

# Realizar dump de la base de datos
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --verbose \
    --no-owner \
    --no-privileges \
    --create \
    --clean \
    --if-exists \
    > "$DB_BACKUP_FILE"

if [ $? -eq 0 ]; then
    # Comprimir el backup
    gzip "$DB_BACKUP_FILE"
    DB_SIZE=$(du -h "$DB_COMPRESSED_FILE" | cut -f1)
    print_success "Backup de BD completado: $DB_COMPRESSED_FILE ($DB_SIZE)"
else
    print_error "Error en backup de base de datos"
    exit 1
fi

# ===================================================================
# 2. BACKUP DE ARCHIVOS UPLOADS
# ===================================================================

if [ -d "${UPLOADS_PATH:-./uploads}" ]; then
    print_status "Realizando backup de archivos uploads..."
    
    UPLOADS_BACKUP_FILE="$BACKUP_DIR/uploads-$DATE.tar.gz"
    
    tar -czf "$UPLOADS_BACKUP_FILE" "${UPLOADS_PATH:-./uploads}"
    
    if [ $? -eq 0 ]; then
        UPLOADS_SIZE=$(du -h "$UPLOADS_BACKUP_FILE" | cut -f1)
        print_success "Backup de uploads completado: $UPLOADS_BACKUP_FILE ($UPLOADS_SIZE)"
    else
        print_warning "Error en backup de uploads"
    fi
else
    print_warning "Directorio de uploads no encontrado, saltando..."
fi

# ===================================================================
# 3. BACKUP DE CONFIGURACIÓN
# ===================================================================

print_status "Realizando backup de configuración..."

CONFIG_BACKUP_FILE="$BACKUP_DIR/config-$DATE.tar.gz"

# Backup de archivos de configuración (sin .env por seguridad)
tar -czf "$CONFIG_BACKUP_FILE" \
    --exclude=".env" \
    --exclude="node_modules" \
    --exclude="logs" \
    --exclude="backups" \
    .

if [ $? -eq 0 ]; then
    CONFIG_SIZE=$(du -h "$CONFIG_BACKUP_FILE" | cut -f1)
    print_success "Backup de configuración completado: $CONFIG_BACKUP_FILE ($CONFIG_SIZE)"
else
    print_warning "Error en backup de configuración"
fi

# ===================================================================
# 4. GENERAR MANIFIESTO
# ===================================================================

print_status "Generando manifiesto de backup..."

MANIFEST_FILE="$BACKUP_DIR/manifest-$DATE.txt"

cat > "$MANIFEST_FILE" << EOF
BACKUP MANIFEST - MAPA DEL TALENTO AGESPORT
===========================================
Fecha: $(date)
Servidor: $(hostname)
Usuario: $(whoami)
Versión Node: $(node --version)

ARCHIVOS INCLUIDOS:
EOF

# Listar archivos de backup del día actual
ls -la "$BACKUP_DIR"/*-$DATE.* >> "$MANIFEST_FILE" 2>/dev/null || true

print_success "Manifiesto generado: $MANIFEST_FILE"

# ===================================================================
# 5. LIMPIAR BACKUPS ANTIGUOS
# ===================================================================

print_status "Limpiando backups antiguos (>$RETENTION_DAYS días)..."

DELETED_COUNT=0

# Buscar y eliminar archivos más antiguos que RETENTION_DAYS
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete  
find "$BACKUP_DIR" -name "*.txt" -mtime +$RETENTION_DAYS -delete

# Contar archivos restantes
REMAINING_COUNT=$(ls -1 "$BACKUP_DIR" | wc -l)

print_success "Limpieza completada. Archivos restantes: $REMAINING_COUNT"

# ===================================================================
# 6. RESUMEN FINAL
# ===================================================================

print_success "🎉 Backup completado exitosamente!"
echo ""
print_status "Resumen:"
echo "📅 Fecha: $DATE"
echo "📁 Directorio: $BACKUP_DIR"
echo "🗄️  Base de datos: ✅"
echo "📄 Archivos: ✅"  
echo "⚙️  Configuración: ✅"
echo "📋 Manifiesto: ✅"
echo ""

# Mostrar espacio usado por backups
TOTAL_BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
print_status "Espacio total usado por backups: $TOTAL_BACKUP_SIZE"

# Sugerir verificación
print_status "Para verificar el backup:"
echo "  zcat $DB_COMPRESSED_FILE | head -50"
echo ""
print_status "Para restaurar el backup:"
echo "  zcat $DB_COMPRESSED_FILE | psql -h \$DB_HOST -p \$DB_PORT -U \$DB_USER -d \$DB_NAME"
