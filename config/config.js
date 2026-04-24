// config/config.js
require('dotenv').config();

const parseBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const publicBaseUrl = process.env.PUBLIC_BASE_URL || 'https://agesport.aiprojects.pro';
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
    password: process.env.DB_PASSWORD || 'your_password_here',
    ssl: parseBoolean(process.env.DB_SSL, false)
      ? { rejectUnauthorized: parseBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED, false) }
      : false,
    max: 20, // pool de conexiones
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  },

  // JWT y autenticación  
  jwt: {
    secret: process.env.JWT_SECRET || 'your_super_secret_key_change_in_production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d'
  },

  // Cifrado AES para datos sensibles
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'your_32_character_encryption_key',
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
