# 🏆 MAPA DEL TALENTO AGESPORT

**Plataforma de Networking y Gestión del Talento para AGESPORT**  
*Asociación Andaluza de Gestores del Deporte*

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://postgresql.org/)
[![License](https://img.shields.io/badge/License-Private-red.svg)](LICENSE)

---

## 📋 **DESCRIPCIÓN**

Sistema completo de networking B2B para profesionales del sector deportivo en Andalucía. Permite a los socios de AGESPORT:

- ✅ **Auto-registro** con aprobación administrativa
- 🔐 **Directorio privado** (solo accesible tras login)
- 🌍 **Búsqueda geográfica** avanzada
- 💬 **Mensajería interna** con moderación
- 📊 **Panel administrativo** completo
- 🛡️ **Cumplimiento RGPD** total
- 🚀 **API RESTful** profesional

---

## 🏗️ **ARQUITECTURA**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   NGINX PROXY   │────│  NODE.JS APP    │────│  POSTGRESQL DB  │
│  (SSL/Security) │    │   (Express)     │    │   (PostGIS)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   FILE SYSTEM   │
                    │ (Uploads/Logs)  │
                    └─────────────────┘
```

### **Tecnologías Principales**
- **Backend**: Node.js 18+ / Express 5
- **Base de Datos**: PostgreSQL 15+ / PostGIS
- **Autenticación**: JWT + bcrypt
- **Seguridad**: Helmet, Rate Limiting, CORS
- **Email**: Nodemailer
- **Deployment**: PM2, Docker, Nginx

---

## 🚀 **DEPLOYMENT RÁPIDO**

### **Opción 1: Script Automático**
```bash
# Clonar y configurar
git clone <repo-url>
cd agesport-production
chmod +x deploy.sh
./deploy.sh
```

### **Opción 2: Docker (Recomendado)**
```bash
# Configurar variables
cp .env.example .env
# Editar .env con tus valores

# Iniciar stack completo
docker-compose up -d

# Crear administrador inicial
docker-compose exec app npm run admin:create admin@agesport.org password123 "Admin Principal"
```

### **Opción 3: Manual**
```bash
# 1. Instalar dependencias
npm install

# 2. Configurar base de datos
createdb agesport_mapa_talento
psql agesport_mapa_talento -f database/schema.sql

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# 4. Iniciar aplicación
npm run production
```

---

## ⚙️ **CONFIGURACIÓN**

### **Variables de Entorno Críticas**
```bash
# Base de datos
DB_HOST=localhost
DB_NAME=agesport_mapa_talento
DB_USER=postgres
DB_PASSWORD=tu_password_seguro

# Seguridad
JWT_SECRET=clave_jwt_super_secreta_32_caracteres_minimo
ENCRYPTION_KEY=clave_aes_exactamente_32_caracteres

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_USER=noreply@agesport.org
EMAIL_PASS=tu_password_email

# Producción
NODE_ENV=production
CORS_ORIGINS=https://mapatalento.agesport.org
```

### **SSL/HTTPS (Producción)**
```bash
# Configurar certificados SSL automáticos
./scripts/setup-ssl.sh

# Renovación automática (crontab)
0 3 1 * * /ruta/proyecto/scripts/ssl-renew.sh
```

---

## 👥 **GESTIÓN DE USUARIOS**

### **Crear Administrador**
```bash
# Crear super-admin
npm run admin:create admin@agesport.org password123 "Juan Pérez"

# Con Docker
docker-compose exec app npm run admin:create admin@agesport.org password123 "Juan Pérez"
```

### **Flujo de Socios**
1. **Socio se registra** → Estado `pendiente`
2. **Admin revisa** → Aprueba/Rechaza en panel
3. **Aprobado** → Socio puede acceder al directorio
4. **Rechazado** → No puede acceder

---

## 🛡️ **SEGURIDAD IMPLEMENTADA**

### **Protección de Datos**
- 🔐 **Encriptación AES-256** para DNI y teléfonos
- 🛡️ **Hashing bcrypt** para passwords
- 🚫 **Rate limiting** anti-abuse
- 📝 **Audit trail** completo
- 🔒 **SQL injection** protection
- 🛡️ **XSS protection** con Helmet

### **RGPD Compliance**
- ✅ **Consentimientos granulares** (8 tipos)
- 📤 **Exportación de datos** personal
- 🗑️ **Derecho al olvido** implementado
- 📋 **Registro de auditoría** completo
- 🔍 **Transparencia total** de datos

### **Control de Acceso**
- 🚪 **Directorio privado**: Solo socios autenticados
- 👑 **Panel admin**: Roles diferenciados
- ⏱️ **Sesiones JWT**: Expiran automáticamente
- 🔄 **Refresh tokens**: Renovación segura

---

## 📊 **MONITOREO Y MANTENIMIENTO**

### **Health Checks**
```bash
# Check completo del sistema
npm run health

# Monitoreo continuo
npm run start scripts/monitoring.js start

# Con PM2
pm2 start scripts/monitoring.js --name agesport-monitor -- start
```

### **Backups Automáticos**
```bash
# Backup manual
./scripts/backup.sh

# Backup automático (crontab)
0 2 * * * /ruta/proyecto/scripts/backup.sh

# Con Docker
docker-compose exec app ./scripts/backup.sh
```

### **Logs**
```bash
# Ver logs aplicación
pm2 logs mapa-talento-agesport

# Ver logs específicos
tail -f logs/app.log
tail -f logs/error.log

# Con Docker
docker-compose logs -f app
```

---

## 🔧 **SCRIPTS DE ADMINISTRACIÓN**

| Script | Descripción | Uso |
|--------|-------------|-----|
| `deploy.sh` | Deployment automático | `./deploy.sh` |
| `create-admin.js` | Crear administradores | `npm run admin:create email pass name` |
| `health-check.js` | Verificación de salud | `npm run health` |
| `backup.sh` | Backup de BD y archivos | `./scripts/backup.sh` |
| `monitoring.js` | Monitoreo con alertas | `node scripts/monitoring.js start` |
| `setup-ssl.sh` | Configurar HTTPS | `./scripts/setup-ssl.sh` |

---

## 📡 **API ENDPOINTS**

### **Autenticación** 🔐
```
POST /api/auth/registro     - Registro de socios
POST /api/auth/login        - Login socios/admin
POST /api/auth/logout       - Cerrar sesión
GET  /api/auth/verify       - Verificar sesión
```

### **Directorio** 👥 (Requiere Auth)
```
GET  /api/socios/directorio     - Búsqueda de socios
GET  /api/socios/perfil/:id     - Ver perfil específico
PUT  /api/socios/perfil         - Actualizar perfil propio
GET  /api/socios/cerca          - Búsqueda geográfica
```

### **Administración** ⚙️ (Solo Admin)
```
GET  /api/admin/pendientes      - Socios por aprobar
PUT  /api/admin/aprobar/:id     - Aprobar socio
PUT  /api/admin/rechazar/:id    - Rechazar socio
GET  /api/admin/estadisticas    - Dashboard stats
```

### **Mensajería** 💬 (Requiere Auth)
```
GET  /api/mensajeria/conversaciones  - Lista conversaciones
POST /api/mensajeria/enviar          - Enviar mensaje
GET  /api/mensajeria/conversacion/:id - Ver conversación
```

---

## 🗄️ **ESTRUCTURA DE BASE DE DATOS**

### **Tablas Principales**
- `socios` - Perfiles de miembros
- `especialidades` - Skills y competencias
- `proyectos_innovacion` - Portfolio de proyectos
- `conversaciones` / `mensajes` - Sistema de chat
- `administradores` - Usuarios admin
- `auditoria` - Log de actividades

### **Características**
- 🌍 **PostGIS** para queries geográficos
- 🔍 **Full-text search** en español
- 📊 **Vistas optimizadas** para dashboards
- 🔄 **Triggers automáticos** para auditoría
- 🗂️ **Índices optimizados** para performance

---

## 🐳 **DOCKER DEPLOYMENT**

### **Servicios Incluidos**
- **app**: Aplicación Node.js principal
- **database**: PostgreSQL + PostGIS
- **nginx**: Proxy reverso con SSL
- **redis**: Cache (opcional)

### **Comandos Docker**
```bash
# Iniciar stack completo
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Ejecutar comandos
docker-compose exec app npm run health

# Backup
docker-compose exec database pg_dump -U postgres agesport_mapa_talento > backup.sql

# Parar servicios
docker-compose down
```

---

## 📈 **PERFORMANCE**

### **Optimizaciones Implementadas**
- ⚡ **Connection pooling** en PostgreSQL
- 🗜️ **Compresión gzip** en Nginx
- 📦 **Static file caching** con cache headers
- 🔄 **JWT stateless** authentication
- 📊 **Database indexing** estratégico

### **Límites Configurados**
- **Rate limiting**: 100 req/15min general, 5 req/15min auth
- **File uploads**: 10MB máximo
- **JWT expiry**: 7 días (configurable)
- **Session timeout**: Inactivo 24h

---

## 🔒 **BACKUP Y RESTAURACIÓN**

### **Backup Automático**
```bash
# Script incluye:
# - Dump completo de PostgreSQL
# - Archivos de uploads
# - Configuración (sin .env)
# - Limpieza automática (>30 días)

./scripts/backup.sh
```

### **Restaurar Backup**
```bash
# Restaurar base de datos
gunzip -c backups/db-20240416-120000.sql.gz | psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Restaurar uploads
tar -xzf backups/uploads-20240416-120000.tar.gz
```

---

## 🚨 **ALERTAS Y NOTIFICACIONES**

### **Sistema de Alertas**
El sistema incluye monitoreo automático con alertas por email:

- 🐌 **Base de datos lenta** (>1s respuesta)
- 💾 **Alto uso memoria** (>80%)
- 💽 **Alto uso disco** (>90%)
- ❌ **Alta tasa errores** (>5/min)
- 🔌 **Muchas conexiones** BD (>100)

### **Configurar Alertas**
```bash
# En .env
ALERT_EMAIL=admin@agesport.org

# Iniciar monitoreo
pm2 start scripts/monitoring.js --name agesport-monitor -- start
```

---

## 🆘 **SOPORTE Y TROUBLESHOOTING**

### **Logs Importantes**
- `logs/app.log` - Log principal aplicación
- `logs/error.log` - Errores críticos
- `logs/monitoring.log` - Salud del sistema
- `/var/log/nginx/` - Logs del proxy

### **Comandos Útiles**
```bash
# Ver estado PM2
pm2 status

# Restart aplicación
pm2 restart mapa-talento-agesport

# Ver métricas sistema
npm run health

# Test conexión BD
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"
```

### **Problemas Comunes**

**🔴 Error conexión BD**
```bash
# Verificar PostgreSQL ejecutándose
sudo systemctl status postgresql
# Verificar credenciales en .env
# Verificar firewall puerto 5432
```

**🔴 SSL no funciona**
```bash
# Verificar certificados
openssl x509 -in nginx/ssl/cert.pem -text -noout
# Renovar certificados
./scripts/ssl-renew.sh
```

**🔴 Alta memoria**
```bash
# Ver procesos
pm2 monit
# Restart aplicación
pm2 restart all --update-env
```

---

## 📞 **CONTACTO TÉCNICO**

- **Repositorio**: [GitHub Privado AGESPORT]
- **Documentación**: Este README
- **Support**: tech@agesport.org
- **Version**: 1.0.0 (Producción)

---

## 📄 **LICENCIA**

© 2024 AGESPORT - Asociación Andaluza de Gestores del Deporte  
**Código Privado** - Todos los derechos reservados

---

*Desarrollado con ❤️ para la comunidad deportiva andaluza*
