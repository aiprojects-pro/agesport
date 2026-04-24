#!/bin/bash

# ===================================================================
# SCRIPT DE DEPLOYMENT - MAPA DEL TALENTO AGESPORT
# ===================================================================
# Este script configura todo lo necesario para producción

set -e  # Salir si cualquier comando falla

echo "🚀 Iniciando deployment del Mapa del Talento AGESPORT..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
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

# ===================================================================
# 1. VERIFICAR PREREQUISITOS
# ===================================================================

print_status "Verificando prerequisitos del sistema..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado. Instalar Node.js >= 16"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Node.js versión $NODE_VERSION detectada. Se requiere >= 16"
    exit 1
fi

# Verificar PostgreSQL
if ! command -v psql &> /dev/null; then
    print_warning "PostgreSQL CLI no detectado. Asegúrate de tener PostgreSQL instalado"
fi

# Verificar PM2 (opcional)
if ! command -v pm2 &> /dev/null; then
    print_warning "PM2 no está instalado. Se recomienda para producción:"
    print_warning "npm install -g pm2"
fi

print_success "Prerequisitos verificados"

# ===================================================================
# 2. CONFIGURAR VARIABLES DE ENTORNO
# ===================================================================

print_status "Configurando variables de entorno..."

if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_warning "Archivo .env creado desde .env.example"
        print_warning "⚠️  IMPORTANTE: Edita .env con tus valores reales antes de continuar"
        print_warning "Presiona ENTER cuando hayas configurado .env..."
        read
    else
        print_error "No se encontró .env.example"
        exit 1
    fi
else
    print_success "Archivo .env ya existe"
fi

# Verificar que las variables críticas estén configuradas
source .env

if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "tu_password_postgres_aqui" ]; then
    print_error "DB_PASSWORD no está configurado en .env"
    exit 1
fi

if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "tu_super_secret_jwt_key_de_al_menos_32_caracteres" ]; then
    print_error "JWT_SECRET no está configurado en .env"
    exit 1
fi

if [ -z "$ENCRYPTION_KEY" ] || [ "$ENCRYPTION_KEY" = "tu_clave_aes_de_exactamente_32_char" ]; then
    print_error "ENCRYPTION_KEY no está configurado en .env"
    exit 1
fi

print_success "Variables de entorno verificadas"

# ===================================================================
# 3. INSTALAR DEPENDENCIAS
# ===================================================================

print_status "Instalando dependencias..."

if [ "$NODE_ENV" = "production" ]; then
    npm ci --only=production
else
    npm install
fi

print_success "Dependencias instaladas"

# ===================================================================
# 4. CONFIGURAR BASE DE DATOS
# ===================================================================

print_status "Configurando base de datos..."

# Verificar conexión a PostgreSQL
if ! PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "SELECT 1;" &> /dev/null; then
    print_error "No se puede conectar a PostgreSQL con las credenciales proporcionadas"
    print_error "Verifica DB_HOST, DB_PORT, DB_USER, DB_PASSWORD en .env"
    exit 1
fi

# Crear base de datos si no existe
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || true

# Verificar/instalar extensiones
print_status "Verificando extensiones de PostgreSQL..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS postgis;"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"

# Ejecutar schema
print_status "Aplicando schema de base de datos..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/schema.sql

print_success "Base de datos configurada"

# ===================================================================
# 5. CREAR DIRECTORIO DE UPLOADS
# ===================================================================

print_status "Configurando directorio de uploads..."

mkdir -p ${UPLOADS_PATH:-./uploads}
chmod 755 ${UPLOADS_PATH:-./uploads}

print_success "Directorio de uploads configurado"

# ===================================================================
# 6. CONFIGURAR ADMINISTRADOR INICIAL
# ===================================================================

print_status "Configurando administrador inicial..."

echo "¿Deseas crear un usuario administrador inicial? (y/n)"
read -r create_admin

if [ "$create_admin" = "y" ] || [ "$create_admin" = "Y" ]; then
    echo "Email del administrador:"
    read -r admin_email
    echo "Password del administrador:"
    read -s admin_password
    echo "Nombre del administrador:"
    read -r admin_nombre
    
    node scripts/create-admin.js "$admin_email" "$admin_password" "$admin_nombre"
    print_success "Administrador inicial creado"
fi

# ===================================================================
# 7. VERIFICAR CONFIGURACIÓN
# ===================================================================

print_status "Verificando configuración..."

# Test de conexión a base de datos
node -e "
const db = require('./config/database');
db.testConnection()
  .then(() => console.log('✓ Conexión a base de datos OK'))
  .catch(err => { console.error('✗ Error conexión DB:', err.message); process.exit(1); });
"

print_success "Configuración verificada"

# ===================================================================
# 8. INSTRUCCIONES FINALES
# ===================================================================

print_success "🎉 Deployment completado exitosamente!"
echo ""
print_status "Siguientes pasos:"
echo ""
echo "1. Para desarrollo:"
echo "   npm run dev"
echo ""
echo "2. Para producción con PM2:"
echo "   pm2 start ecosystem.config.js"
echo ""
echo "3. El servidor estará disponible en:"
echo "   http://localhost:${PORT:-3001}"
echo ""
echo "4. Panel de administración:"
echo "   http://localhost:${PORT:-3001}/admin"
echo ""
print_warning "Recuerda configurar tu firewall y SSL para producción!"
print_warning "Revisa los logs con: pm2 logs mapa-talento-agesport"
