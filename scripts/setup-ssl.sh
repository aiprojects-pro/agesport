#!/bin/bash

# ===================================================================
# SCRIPT DE CONFIGURACIÓN SSL - MAPA DEL TALENTO AGESPORT
# ===================================================================
# Configura SSL automático con Let's Encrypt

set -e

# Configuración
DOMAIN="mapatalento.agesport.org"
EMAIL="admin@agesport.org"
WEBROOT="/var/www/certbot"

# Colores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[SSL]${NC} $1"
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

print_status "Verificando prerequisitos para SSL..."

if ! command -v docker &> /dev/null; then
    print_error "Docker no está instalado. Se requiere Docker para Let's Encrypt"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose no está instalado"
    exit 1
fi

print_success "Prerequisitos verificados"

# ===================================================================
# 2. CREAR DIRECTORIO PARA CERTIFICADOS
# ===================================================================

print_status "Creando estructura de directorios..."

mkdir -p nginx/ssl
mkdir -p certbot/conf
mkdir -p certbot/www

print_success "Directorios creados"

# ===================================================================
# 3. CREAR CERTIFICADO TEMPORAL
# ===================================================================

print_status "Generando certificado temporal para inicialización..."

openssl req -x509 -nodes -newkey rsa:4096 \
    -days 1 \
    -keyout nginx/ssl/key.pem \
    -out nginx/ssl/cert.pem \
    -subj "/CN=${DOMAIN}"

print_success "Certificado temporal creado"

# ===================================================================
# 4. CREAR DOCKER COMPOSE PARA CERTBOT
# ===================================================================

print_status "Configurando Let's Encrypt..."

cat > docker-compose.ssl.yml << EOF
version: '3.8'

services:
  certbot:
    image: certbot/certbot:latest
    container_name: agesport-certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    command: certonly --webroot --webroot-path=/var/www/certbot --email ${EMAIL} --agree-tos --no-eff-email -d ${DOMAIN} -d www.${DOMAIN}
    
  nginx-ssl:
    image: nginx:alpine
    container_name: agesport-nginx-ssl
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx-ssl.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - certbot
EOF

# Crear configuración temporal de nginx para validación
cat > nginx/nginx-ssl.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name mapatalento.agesport.org www.mapatalento.agesport.org;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'AGESPORT SSL Setup';
            add_header Content-Type text/plain;
        }
    }
}
EOF

print_success "Configuración Let's Encrypt creada"

# ===================================================================
# 5. OBTENER CERTIFICADO REAL
# ===================================================================

print_warning "Para obtener el certificado SSL real, ejecuta:"
echo "1. docker-compose -f docker-compose.ssl.yml up nginx-ssl -d"
echo "2. docker-compose -f docker-compose.ssl.yml run --rm certbot"
echo "3. Copiar certificados: cp certbot/conf/live/${DOMAIN}/*.pem nginx/ssl/"
echo "4. docker-compose -f docker-compose.ssl.yml down"
echo "5. docker-compose up -d"

# ===================================================================
# 6. CREAR SCRIPT DE RENOVACIÓN
# ===================================================================

print_status "Creando script de renovación automática..."

cat > scripts/ssl-renew.sh << 'EOF'
#!/bin/bash

# Script de renovación automática de SSL
echo "🔄 Renovando certificados SSL..."

docker-compose -f docker-compose.ssl.yml run --rm certbot renew

if [ $? -eq 0 ]; then
    echo "✅ Certificados renovados exitosamente"
    
    # Copiar certificados actualizados
    cp certbot/conf/live/mapatalento.agesport.org/fullchain.pem nginx/ssl/cert.pem
    cp certbot/conf/live/mapatalento.agesport.org/privkey.pem nginx/ssl/key.pem
    
    # Recargar nginx
    docker-compose exec nginx nginx -s reload
    
    echo "✅ Nginx recargado con nuevos certificados"
else
    echo "❌ Error renovando certificados"
fi
EOF

chmod +x scripts/ssl-renew.sh

print_success "Script de renovación creado"

# ===================================================================
# 7. CONFIGURAR CRON PARA RENOVACIÓN AUTOMÁTICA
# ===================================================================

print_status "Configurando renovación automática..."

# Agregar a crontab (ejecutar cada mes)
CRON_JOB="0 3 1 * * $(pwd)/scripts/ssl-renew.sh >> $(pwd)/logs/ssl-renew.log 2>&1"

print_warning "Para configurar renovación automática, ejecuta:"
echo "crontab -e"
echo "Y agrega la línea:"
echo "${CRON_JOB}"

print_success "🎉 Configuración SSL completada!"
echo ""
print_status "Siguientes pasos:"
echo "1. Configurar DNS apuntando a tu servidor"
echo "2. Ejecutar los comandos mostrados arriba para obtener certificados reales"
echo "3. Iniciar el stack completo con docker-compose up -d"
echo ""
print_warning "IMPORTANTE: Asegúrate de que el puerto 80 esté abierto para la validación"
