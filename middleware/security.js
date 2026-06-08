// middleware/security.js
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const config = require('../config/config');
const catalogos = require('../config/catalogos');

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

// Rate limiting para forgot-password. NO usa skipSuccessfulRequests porque
// forgotPassword devuelve 200 siempre por seguridad (no revela cuentas);
// si usásemos authLimiter con skipSuccessfulRequests:true se podrían
// enviar mails ilimitados.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => {
    const email =
      req.body && typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : 'anon';
    return `${ipKeyGenerator(req.ip)}:${email}`;
  },
  message: {
    error: 'Demasiados intentos. Espera unos minutos antes de volver a probar.',
  },
  standardHeaders: true,
  legacyHeaders: false,
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

    // CRÍTICO: preservar arrays como arrays. Si los procesamos como objeto plano
    // se convertirían en { 0: ..., 1: ... } y se rompería Array.isArray() en los
    // controladores (p. ej. al guardar especialidades en el perfil).
    if (Array.isArray(obj)) {
      return obj.map((item) => {
        if (typeof item === 'string') return sanitizeString(item);
        if (typeof item === 'object' && item !== null) return sanitizeObject(item);
        return item;
      });
    }

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

  // Aplicar sanitización.
  // CRÍTICO Express 5: `req.query` es un getter que parsea `qs.parse(
  // querystring)` en CADA acceso (no está cacheado). Reasignar
  // `req.query = …` es no-op, y mutar el objeto devuelto tampoco
  // persiste — el siguiente acceso descarta esa mutación y devuelve
  // un objeto fresco. La única forma fiable es overridear el getter
  // con un valor estático via Object.defineProperty.
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.query) {
    const cleaned = sanitizeObject(req.query);
    Object.defineProperty(req, 'query', {
      value: cleaned,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  if (req.params) req.params = sanitizeObject(req.params);

  next();
};

// Validar formato de email
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validar formato de teléfono (acepta español, internacional o vacío)
const validateSpanishPhone = (phone) => {
  if (!phone) return true;
  const cleaned = String(phone).replace(/[\s\-().]/g, '');
  // Acepta: +XX seguido de 6-15 dígitos, o 9 dígitos españoles, o número internacional sin +
  return /^(\+?\d{6,15})$/.test(cleaned);
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
// Validador unificado para alta y actualización de perfil.
// mode='registration': todos los required deben venir; mode='profile':
// sólo se valida lo presente. Reglas de formato idénticas en ambos modos.
const validateSocioFields = (mode) => (req, res, next) => {
  const b = req.body || {};
  const required = mode === 'registration';
  const errors = [];

  const isEmpty = (v) => v === undefined || v === null || v === '';

  const check = (val, formatOk, msg) => {
    if (isEmpty(val)) {
      if (required) errors.push(msg);
      return;
    }
    if (!formatOk(val)) errors.push(msg);
  };

  check(b.email, validateEmail, 'Email inválido');
  check(
    b.password,
    validatePassword,
    'Contraseña debe tener mínimo 8 caracteres, 1 mayúscula, 1 minúscula y 1 número'
  );
  check(b.nombre, (v) => v.trim().length >= 2, 'Nombre debe tener al menos 2 caracteres');
  check(b.apellidos, (v) => v.trim().length >= 2, 'Apellidos debe tener al menos 2 caracteres');
  check(b.provincia, catalogos.isValidProvincia, 'Provincia inválida');
  check(b.localidad, (v) => v.trim().length >= 2, 'Localidad es requerida');
  check(b.cargo_actual, (v) => v.trim().length >= 3, 'Cargo actual es requerido');

  // anos_experiencia: required en registro, rango 0-50 cuando presente
  if (b.anos_experiencia === undefined) {
    if (required) errors.push('Años de experiencia debe ser entre 0 y 50');
  } else {
    const n = parseInt(b.anos_experiencia);
    if (isNaN(n) || n < 0 || n > 50) {
      errors.push('Años de experiencia debe ser entre 0 y 50');
    }
  }

  // Siempre opcionales (sólo se valida formato cuando vienen)
  if (b.dni_nie && !validateSpanishID(b.dni_nie)) errors.push('DNI/NIE inválido');
  if (b.telefono && !validateSpanishPhone(b.telefono)) errors.push('Teléfono inválido');
  if (
    b.comunidad_autonoma &&
    !catalogos.COMUNIDADES_AUTONOMAS.some((ca) => ca.slug === b.comunidad_autonoma)
  ) {
    errors.push('Comunidad autónoma inválida');
  }
  if (b.tipo_socio && !catalogos.isValidTipoSocio(b.tipo_socio)) {
    errors.push('Tipo de socio inválido');
  }
  if (b.rol_cluster && !catalogos.isValidRolSlug(b.rol_cluster)) {
    errors.push('Rol del clúster inválido');
  }
  if (Array.isArray(b.especialidades)) {
    const invalid = b.especialidades.filter((e) => !catalogos.isValidEspecialidadSlug(e));
    if (invalid.length > 0) {
      errors.push('Especialidades inválidas: ' + invalid.join(', '));
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: required ? 'Datos de registro inválidos' : 'Datos de perfil inválidos',
      details: errors,
    });
  }
  next();
};

const validateRegistrationData = validateSocioFields('registration');
const validateProfileData = validateSocioFields('profile');

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
  forgotPasswordLimiter,
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
