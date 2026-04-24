# ✅ CHECKLIST DE DEPLOYMENT - MAPA DEL TALENTO AGESPORT

## 📋 **PRE-DEPLOYMENT**

### **Prerequisitos del Sistema**
- [ ] Node.js >= 18.0.0 instalado
- [ ] PostgreSQL >= 15 con PostGIS instalado
- [ ] PM2 instalado globalmente (`npm install -g pm2`)
- [ ] Nginx instalado (opcional, para SSL)
- [ ] Docker y Docker Compose (opcional)

### **Configuración de Servidor**
- [ ] Firewall configurado (puertos 22, 80, 443, 3001, 5432)
- [ ] Usuario deploy creado (opcional)
- [ ] Permisos de archivo correctos
- [ ] Espacio en disco suficiente (> 5GB recomendado)

---

## 🔧 **CONFIGURACIÓN**

### **Variables de Entorno**
- [ ] Archivo `.env` creado desde `.env.example`
- [ ] `DB_PASSWORD` configurado con password seguro
- [ ] `JWT_SECRET` configurado (>32 caracteres)
- [ ] `ENCRYPTION_KEY` configurado (exactamente 32 caracteres)
- [ ] `EMAIL_USER` y `EMAIL_PASS` configurados
- [ ] `NODE_ENV=production` configurado
- [ ] `CORS_ORIGINS` configurado con dominio real

### **Base de Datos**
- [ ] PostgreSQL corriendo
- [ ] Extensión PostGIS instalada
- [ ] Extensión pgcrypto instalada
- [ ] Base de datos `agesport_mapa_talento` creada
- [ ] Usuario de BD tiene permisos necesarios
- [ ] Schema aplicado (`psql -f database/schema.sql`)

---

## 🚀 **DEPLOYMENT**

### **Instalación**
- [ ] Dependencias instaladas (`npm install`)
- [ ] Tests de conexión BD exitosos
- [ ] Health check funciona (`npm run health`)
- [ ] Directorio uploads creado con permisos
- [ ] Directorio logs creado

### **Administrador Inicial**
- [ ] Admin creado (`npm run admin:create`)
- [ ] Login admin funciona
- [ ] Panel admin accesible

### **Aplicación**
- [ ] Aplicación iniciada (`npm run production` o `npm run pm2:start`)
- [ ] Endpoint `/health` responde 200
- [ ] Endpoints API funcionan
- [ ] Frontend carga correctamente

---

## 🛡️ **SEGURIDAD**

### **SSL/HTTPS (Producción)**
- [ ] Certificados SSL configurados
- [ ] HTTPS funciona correctamente
- [ ] HTTP redirige a HTTPS
- [ ] Headers de seguridad configurados

### **Firewall**
- [ ] Solo puertos necesarios abiertos
- [ ] Rate limiting funcionando
- [ ] CORS configurado correctamente
- [ ] Headers de seguridad activos

---

## 📊 **MONITOREO**

### **Logs**
- [ ] Logs escribiendo correctamente
- [ ] Rotación de logs configurada
- [ ] Logs de error monitoreados

### **Health Checks**
- [ ] Health check automático funcionando
- [ ] Sistema de alertas configurado (opcional)
- [ ] Métricas de rendimiento disponibles

### **Backup**
- [ ] Script backup funciona
- [ ] Backup automático configurado (cron)
- [ ] Restauración de backup probada

---

## 🧪 **TESTING POST-DEPLOYMENT**

### **Funcionalidad Básica**
- [ ] Registro de socio funciona
- [ ] Aprobación admin funciona
- [ ] Login socio funciona
- [ ] Directorio solo visible tras auth
- [ ] Búsqueda de socios funciona
- [ ] Mensajería funciona

### **Seguridad**
- [ ] Directorio NO accesible sin auth
- [ ] Panel admin solo para admins
- [ ] Rate limiting activo
- [ ] Datos sensibles encriptados

### **Performance**
- [ ] Tiempo respuesta < 2s
- [ ] Base de datos responde < 500ms
- [ ] Archivos estáticos con cache
- [ ] Compresión gzip activa

---

## 🔄 **MANTENIMIENTO**

### **Tareas Programadas**
- [ ] Backup diario configurado
- [ ] Renovación SSL automática (si aplica)
- [ ] Limpieza de logs antiguos
- [ ] Monitoreo de salud continuo

### **Documentación**
- [ ] Credenciales documentadas (seguras)
- [ ] Procedimientos de emergencia claros
- [ ] Contactos de soporte definidos
- [ ] Runbook de operaciones completo

---

## ⚡ **COMANDOS RÁPIDOS DE VERIFICACIÓN**

```bash
# Health check completo
npm run health

# Estado de servicios
pm2 status
systemctl status postgresql
systemctl status nginx  # si aplica

# Test conectividad BD
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"

# Test endpoint principal
curl -f http://localhost:3001/health

# Ver logs últimas 50 líneas
tail -50 logs/app.log

# Verificar certificados SSL (si aplica)
openssl x509 -in nginx/ssl/cert.pem -text -noout | grep "Not After"
```

---

## 🚨 **EN CASO DE PROBLEMAS**

### **Rollback Plan**
1. Parar aplicación actual: `pm2 stop mapa-talento-agesport`
2. Restaurar backup BD: `gunzip -c backup.sql.gz | psql ...`
3. Revertir código a versión anterior
4. Reiniciar servicios

### **Contactos de Emergencia**
- **Technical Lead**: tech@agesport.org
- **Database Admin**: dba@agesport.org
- **Infrastructure**: ops@agesport.org

---

## ✅ **SIGN-OFF**

- [ ] **Funcionalidad completa** verificada
- [ ] **Seguridad** validada
- [ ] **Performance** aceptable
- [ ] **Monitoreo** activo
- [ ] **Backup** funcionando
- [ ] **Documentación** actualizada

**Deployed by**: ________________  
**Date**: ________________  
**Version**: v1.0.0  
**Environment**: Production

---

**🎉 ¡Deployment completado exitosamente!**
