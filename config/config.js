// config/config.js
require('dotenv').config();

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const JWT_SECRET_DEFAULT = 'your_super_secret_key_change_in_production';
const ENCRYPTION_KEY_DEFAULT = 'your_32_character_encryption_key';
const DB_PASSWORD_DEFAULT = 'your_password_here';

const jwtSecret = process.env.JWT_SECRET || JWT_SECRET_DEFAULT;
const encryptionKey = process.env.ENCRYPTION_KEY || ENCRYPTION_KEY_DEFAULT;
const dbPassword = process.env.DB_PASSWORD || DB_PASSWORD_DEFAULT;

// Nota: EMAIL_USER/EMAIL_PASS también tienen "defaults" en el módulo, pero
// son centinelas de "email deshabilitado" en emailService.js (PLACEHOLDER_VALUES),
// no riesgos de seguridad — no se añaden al guard.
if (process.env.NODE_ENV === 'production') {
  const insecure = [];
  if (jwtSecret === JWT_SECRET_DEFAULT) insecure.push('JWT_SECRET');
  if (encryptionKey === ENCRYPTION_KEY_DEFAULT) insecure.push('ENCRYPTION_KEY');
  if (dbPassword === DB_PASSWORD_DEFAULT) insecure.push('DB_PASSWORD');
  if (insecure.length > 0) {
    console.error(
      `FATAL: refusing to start in production with default values for ${insecure.join(', ')}. Set them in .env`
    );
    process.exit(1);
  }
}

// Coerce empty string a default. `process.env.PUBLIC_BASE_URL=''` (vacío)
// haría que el fallback dispare `req.get('host')` y abriría host-header
// injection: un atacante POSTea forgot-password con `Host: evil.com` y
// el email de reset apunta a evil.com → token leak. Aquí garantizamos
// que `publicBaseUrl` SIEMPRE es una URL válida y absoluta.
const publicBaseUrlRaw = (process.env.PUBLIC_BASE_URL || '').trim();
const publicBaseUrl = publicBaseUrlRaw || 'https://agesport.aiprojects.pro';
if (!/^https?:\/\/[^\s]+$/.test(publicBaseUrl)) {
  console.error(
    `FATAL: PUBLIC_BASE_URL no es una URL absoluta válida ("${publicBaseUrl}"). Debe empezar por http:// o https://.`
  );
  process.exit(1);
}
const corsOrigins = (process.env.CORS_ORIGINS || publicBaseUrl)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  // Base de datos
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'agesport_mapa_talento',
    user: process.env.DB_USER || 'postgres',
    password: dbPassword,
    ssl: parseBoolean(process.env.DB_SSL, false)
      ? { rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, false) }
      : false,
    max: 20, // pool de conexiones
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  },

  // JWT y autenticación
  jwt: {
    secret: jwtSecret,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  // Cifrado AES para datos sensibles
  encryption: {
    key: encryptionKey,
    algorithm: 'aes-256-cbc'
  },

  // Rate limiting
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // requests por IP
    message: 'Demasiadas peticiones desde esta IP, inténtalo más tarde.'
  },

  // CORS
  cors: {
    origin: corsOrigins,
    credentials: true,
    optionsSuccessStatus: 200
  },

  // Email (para notificaciones)
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || 'noreply@agesport.org',
      pass: process.env.EMAIL_PASS || 'your_email_password'
    }
  },

  // Geocoding
  geocoding: {
    service: 'nominatim', // nominatim (gratis) o mapbox (api key needed)
    mapboxKey: process.env.MAPBOX_API_KEY,
    rateLimit: 1000 // requests per hour for Nominatim
  },

  // Uploads
  uploads: {
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowedMimetypes: ['image/jpeg', 'image/png', 'image/webp'],
    path: process.env.UPLOADS_PATH || './uploads'
  },

  // Servidor
  server: {
    port: process.env.PORT || 3001,
    host: process.env.HOST || '0.0.0.0'
  },

  app: {
    publicBaseUrl
  },

  // RGPD
  rgpd: {
    dataRetentionDays: 2555, // ~7 años (legal requirement)
    auditRetentionDays: 2555,
    cookieMaxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
  }
};
