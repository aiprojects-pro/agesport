# ===================================================================
# DOCKERFILE - MAPA DEL TALENTO AGESPORT
# ===================================================================
# Imagen base con Node.js LTS
FROM node:18-alpine

# Metadatos
LABEL maintainer="AGESPORT <tech@agesport.org>"
LABEL version="1.0.0"
LABEL description="Mapa del Talento AGESPORT - Plataforma de networking"

# Instalar dependencias del sistema
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash \
    tzdata

# Configurar zona horaria
ENV TZ=Europe/Madrid
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Crear usuario para la aplicación
RUN addgroup -g 1001 -S agesport && \
    adduser -S agesport -u 1001 -G agesport

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código fuente
COPY --chown=agesport:agesport . .

# Crear directorios necesarios
RUN mkdir -p logs uploads backups && \
    chown -R agesport:agesport logs uploads backups

# Exponer puerto
EXPOSE 3001

# Cambiar a usuario no-root
USER agesport

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Comando por defecto
CMD ["npm", "start"]
