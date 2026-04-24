// middleware/security.js
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config/config');

const authLimitMax = parseInt(process.env.RATE_LIMIT_AUTH_MAX || '20', 10);
const registerLimitMax = parseInt(process.env.RATE_LIMIT_REGISTER_MAX || '10', 10);

// Rate limiting general
const generalLimiter = rateLimit({
  windowMs: config.rateLimiting.windowMs,
  max: config.rateLimiting.max,
  message: {
    error: config.rateLimiting.message
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const path = req.path || '';
    if (
      path === '/favicon.ico' ||
      path === '/health' ||
      path.startsWith('/assets/') ||
      path.startsWith('/css/') ||
      path.startsWith('/js/') ||
      path.startsWith('/images/')
    ) {
      return true;
    }

    // Skip rate limiting para admins en desarrollo
    return process.env.NODE_ENV === 'development' && 
           req.headers.authorization?.includes('admin');
  }
});

// Rate limiting estricto para login
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: authLimitMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = (req.body && typeof req.body.email === 'string')
      ? req.body.email.trim().toLowerCase()
      : 'anon';
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  message: {
    error: 'Demasiados intentos de inicio de sesión. Inténtalo de nuevo en unos minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para registro
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: registerLimitMax,
  keyGenerator: (req) => {
    const email = (req.body && typeof req.body.email === 'string')
      ? req.body.email.trim().toLowerCase()
      : 'anon';
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  message: {
    error: 'Demasiados registros desde esta conexión. Inténtalo de nuevo más tarde.'
  }
});

// Rate limiting para mensajería
const messagingLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 20, // máximo 20 mensajes por usuario cada 5 minutos
  keyGenerator: (req) => {
    return req.socioId || ipKeyGenerator(req.ip); // Rate limit por socio, no por IP
  },
  message: {
    error: 'Demasiados mensajes enviados. Espera un momento antes de enviar más.'
  }
});

// Validación de entrada para prevenir inyección
const validateInput = (req, res, next) => {
  // Sanitizar strings de entrada
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[<>]/g, ''); // Básico XSS protection
  };

  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  // Aplicar sanitización
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) req.query = sanitizeObject(req.query);
  if (req.params) req.params = sanitizeObject(req.params);

  next();
};

// Validar formato de email
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validar formato de teléfono español
const validateSpanishPhone = (phone) => {
  const phoneRegex = /^(\+34|0034|34)?[6789]\d{8}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
};

// Validar DNI/NIE español
const validateSpanishID = (id) => {
  const dniRegex = /^\d{8}[A-Z]$/;
  const nieRegex = /^[XYZ]\d{7}[A-Z]$/;
  return dniRegex.test(id) || nieRegex.test(id);
};

// Validar contraseña segura
const validatePassword = (password) => {
  // Mínimo 8 caracteres, al menos 1 mayúscula, 1 minúscula, 1 número
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

// Middleware de validación de registro
const validateRegistrationData = (req, res, next) => {
  const { 
    email, password, nombre, apellidos, provincia, 
    localidad, cargo_actual, anos_experiencia 
  } = req.body;

  const errors = [];

  // Validaciones requeridas
  if (!email || !validateEmail(email)) {
    errors.push('Email inválido');
  }
  
  if (!password || !validatePassword(password)) {
    errors.push('Contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula y 1 número');
  }
  
  if (!nombre || nombre.trim().length < 2) {
    errors.push('Nombre debe tener al menos 2 caracteres');
  }
  
  if (!apellidos || apellidos.trim().length < 2) {
    errors.push('Apellidos debe tener al menos 2 caracteres');
  }
  
  if (!provincia || !['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla'].includes(provincia)) {
    errors.push('Provincia debe ser una de las 8 provincias andaluzas');
  }
  
  if (!localidad || localidad.trim().length < 2) {
    errors.push('Localidad es requerida');
  }
  
  if (!cargo_actual || cargo_actual.trim().length < 3) {
    errors.push('Cargo actual es requerido');
  }
  
  if (anos_experiencia === undefined || anos_experiencia < 0 || anos_experiencia > 50) {
    errors.push('Años de experiencia debe ser entre 0 y 50');
  }

  // Validaciones opcionales
  if (req.body.dni_nie && !validateSpanishID(req.body.dni_nie)) {
    errors.push('DNI/NIE inválido');
  }
  
  if (req.body.telefono && !validateSpanishPhone(req.body.telefono)) {
    errors.push('Teléfono inválido (formato español)');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'Datos de registro inválidos', 
      details: errors 
    });
  }

  next();
};

// Middleware de validación de datos de perfil
const validateProfileData = (req, res, next) => {
  const errors = [];
  
  // Solo validar campos que se están actualizando
  if (req.body.email && !validateEmail(req.body.email)) {
    errors.push('Email inválido');
  }
  
  if (req.body.dni_nie && !validateSpanishID(req.body.dni_nie)) {
    errors.push('DNI/NIE inválido');
  }
  
  if (req.body.telefono && !validateSpanishPhone(req.body.telefono)) {
    errors.push('Teléfono inválido');
  }
  
  if (req.body.anos_experiencia !== undefined) {
    const exp = parseInt(req.body.anos_experiencia);
    if (isNaN(exp) || exp < 0 || exp > 50) {
      errors.push('Años de experiencia debe ser entre 0 y 50');
    }
  }
  
  if (req.body.provincia && !['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla'].includes(req.body.provincia)) {
    errors.push('Provincia debe ser una de las 8 provincias andaluzas');
  }

  if (errors.length > 0) {
    return res.status(400).json({ 
      error: 'Datos de perfil inválidos', 
      details: errors 
    });
  }

  next();
};

// Middleware para logging de seguridad
const securityLogger = (req, res, next) => {
  const queryString = new URLSearchParams(req.query || {}).toString();
  const path = req.path || '';
  const userAgent = req.get('User-Agent') || '';
  const suspiciousPatterns = [
    /\.\./,
    /<script/i,
    /\bunion\b.*\bselect\b/i,
    /\bdrop\b\s+\btable\b/i,
    /%3cscript/i,
    /\/wp-admin/i,
    /\.php\b/i
  ];
  const isSuspicious = suspiciousPatterns.some((pattern) => {
    return pattern.test(path) || pattern.test(queryString) || pattern.test(userAgent);
  });

  // Log de accesos sospechosos
  if (isSuspicious) {
    console.log(`🚨 Acceso sospechoso: ${req.ip} - ${req.method} ${path} - ${userAgent}`);
    
    // Opcional: alertar por email en producción
    if (process.env.NODE_ENV === 'production') {
      // TODO: Implementar alerta por email
    }
  }
  
  next();
};

// Headers de seguridad adicionales
const securityHeaders = (req, res, next) => {
  // Prevenir clickjacking
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  
  // Prevenir MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // HTTPS Strict Transport Security (solo en producción)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  registerLimiter,
  messagingLimiter,
  validateInput,
  validateEmail,
  validateSpanishPhone,
  validateSpanishID,
  validatePassword,
  validateRegistrationData,
  validateProfileData,
  securityLogger,
  securityHeaders
};
