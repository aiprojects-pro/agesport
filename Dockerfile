# ===================================================================
# DOCKERFILE - MAPA DEL TALENTO AGESPORT
# ===================================================================
# Imagen base con Node.js LTS compatible con el despliegue OKD.
FROM node:20-alpine

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

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copiar código fuente
COPY --chown=:0 . .

# Crear directorios necesarios con permisos compatibles con UID aleatorio de OpenShift.
RUN mkdir -p logs uploads backups && \
    chgrp -R 0 /app && \
    chmod -R g=u /app

# Exponer puerto
EXPOSE 3001

# UID no-root por defecto; OpenShift lo sustituira por un UID aleatorio.
USER 1001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Comando por defecto
CMD ["npm", "start"]
