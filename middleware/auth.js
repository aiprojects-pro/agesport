// middleware/auth.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const config = require('../config/config');
const db = require('../config/database');

// ==================== AUTENTICACIÓN JWT ====================

const generateToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, { 
    expiresIn: config.jwt.expiresIn,
    issuer: 'agesport-mapa-talento'
  });
};

const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, { 
    expiresIn: config.jwt.refreshExpiresIn,
    issuer: 'agesport-mapa-talento'
  });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new Error('Token inválido');
  }
};

// Middleware para rutas que requieren autenticación de socio
const authenticateSocio = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Acceso denegado. Debes iniciar sesión como socio.' 
      });
    }

    const decoded = verifyToken(token);
    
    if (decoded.type !== 'socio') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Solo para socios.' 
      });
    }

    // Verificar que el socio existe y está activo
    const socio = await db.findOne('socios', { 
      id: decoded.socioId, 
      activo: true, 
      estado: 'aprobado' 
    }, 'id, email, nombre, apellidos, ultimo_acceso');

    if (!socio) {
      return res.status(401).json({ 
        error: 'Socio no encontrado o inactivo.' 
      });
    }

    // Actualizar último acceso
    await db.update('socios', 
      { ultimo_acceso: new Date() }, 
      { id: socio.id }
    );

    req.socio = socio;
    req.socioId = socio.id;
    next();

  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Sesión expirada. Por favor, inicia sesión de nuevo.' 
      });
    }
    
    console.error('Error en authenticateSocio:', error);
    res.status(401).json({ error: 'Token inválido.' });
  }
};

// Middleware para rutas que requieren autenticación de administrador
const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.adminToken || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Acceso denegado. Debes iniciar sesión como administrador.' 
      });
    }

    const decoded = verifyToken(token);
    
    if (decoded.type !== 'admin') {
      return res.status(403).json({ 
        error: 'Acceso denegado. Solo para administradores.' 
      });
    }

    const admin = await db.findOne('administradores', { 
      id: decoded.adminId, 
      activo: true 
    }, 'id, email, nombre, rol');

    if (!admin) {
      return res.status(401).json({ 
        error: 'Administrador no encontrado o inactivo.' 
      });
    }

    // Actualizar último acceso
    await db.update('administradores', 
      { ultimo_acceso: new Date() }, 
      { id: admin.id }
    );

    req.admin = admin;
    req.adminId = admin.id;
    next();

  } catch (error) {
    console.error('Error en authenticateAdmin:', error);
    res.status(401).json({ error: 'Token de administrador inválido.' });
  }
};

// Middleware opcional - permite tanto socios como admins
const authenticateAny = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.cookies.adminToken || 
                  req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Acceso denegado. Debes iniciar sesión.' 
      });
    }

    const decoded = verifyToken(token);
    
    if (decoded.type === 'socio') {
      const socio = await db.findOne('socios', { 
        id: decoded.socioId, 
        activo: true, 
        estado: 'aprobado' 
      });
      if (socio) {
        req.user = { ...socio, type: 'socio' };
        req.socio = socio;
        req.socioId = socio.id;
      }
    } else if (decoded.type === 'admin') {
      const admin = await db.findOne('administradores', { 
        id: decoded.adminId, 
        activo: true 
      });
      if (admin) {
        req.user = { ...admin, type: 'admin' };
        req.admin = admin;
        req.adminId = admin.id;
      }
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no encontrado.' });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido.' });
  }
};

// ==================== CIFRADO DE DATOS SENSIBLES ====================
// Usamos AES-256-CBC con IV aleatorio por valor. La clave se deriva
// de la `ENCRYPTION_KEY` configurada para garantizar 32 bytes exactos.
// Formato de salida: "ivHex:cipherHex" para poder descifrar después.

const deriveEncryptionKey = () => {
  const raw = String(config.encryption.key || '');
  return crypto.createHash('sha256').update(raw).digest(); // 32 bytes
};

const encryptData = (text) => {
  if (!text) return null;
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decryptData = (encryptedText) => {
  if (!encryptedText) return null;
  try {
    // Soporte para el formato nuevo "iv:cipher"
    if (typeof encryptedText === 'string' && encryptedText.includes(':')) {
      const [ivHex, cipherHex] = encryptedText.split(':');
      const key = deriveEncryptionKey();
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    // Si no tiene IV (formato legacy createCipher), no podemos descifrar de forma segura.
    return null;
  } catch (error) {
    console.error('Error descifrando datos:', error.message);
    return null;
  }
};

// ==================== HASHING DE CONTRASEÑAS ====================

const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

const comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

// ==================== AUDITORÍA RGPD ====================

const auditAction = async (socioId, adminId, action, resource, previousData, newData, req) => {
  try {
    await db.insert('auditoria', {
      socio_id: socioId || null,
      admin_id: adminId || null,
      accion: action,
      recurso: resource,
      datos_anteriores: previousData ? JSON.stringify(previousData) : null,
      datos_nuevos: newData ? JSON.stringify(newData) : null,
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });
  } catch (error) {
    console.error('Error registrando auditoría:', error);
  }
};

// Middleware para registrar auditoría automáticamente
const withAudit = (action, resource) => {
  return (req, res, next) => {
    const originalJson = res.json;
    res.json = function(data) {
      // Registrar auditoría después de la respuesta exitosa
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setImmediate(() => {
          auditAction(
            req.socioId, 
            req.adminId, 
            action, 
            resource, 
            req.previousData, 
            data, 
            req
          );
        });
      }
      return originalJson.call(this, data);
    };
    next();
  };
};

// ==================== VALIDACIÓN DE PERMISOS ====================

// Verificar si un socio puede ver datos de otro socio
const canViewSocio = async (viewerId, targetSocioId) => {
  if (viewerId === targetSocioId) return true; // Propio perfil
  
  const targetConsents = await db.findOne('consentimientos', { 
    socio_id: targetSocioId 
  });
  
  return targetConsents && targetConsents.acepta_mapa_interactivo && 
         targetConsents.acepta_visibilidad_datos;
};

// Filtrar datos sensibles según consentimientos
const filterSensitiveData = (socioData, viewerIsOwner = false, viewerIsAdmin = false) => {
  if (viewerIsAdmin) return socioData; // Admin ve todo
  if (viewerIsOwner) return socioData; // Propio perfil ve todo
  
  // Para otros socios, filtrar según consentimientos
  const filtered = { ...socioData };
  
  // Datos que siempre se ocultan de otros socios
  delete filtered.dni_nie_encrypted;
  delete filtered.email;
  
  // Datos condicionados por consentimientos
  if (!socioData.visible_telefono) {
    delete filtered.telefono_encrypted;
  }
  if (!socioData.visible_email_directo) {
    delete filtered.email;
  }
  if (!socioData.visible_web_profesional) {
    delete filtered.web_profesional;
  }
  if (!socioData.visible_linkedin) {
    delete filtered.linkedin_url;
  }
  if (!socioData.visible_direccion_completa) {
    delete filtered.direccion_completa;
    delete filtered.latitud;
    delete filtered.longitud;
  }
  
  return filtered;
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  authenticateSocio,
  authenticateAdmin,
  authenticateAny,
  encryptData,
  decryptData,
  hashPassword,
  comparePassword,
  auditAction,
  withAudit,
  canViewSocio,
  filterSensitiveData
};
