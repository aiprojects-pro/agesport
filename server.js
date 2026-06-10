// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config/config');
const db = require('./config/database');

const {
  generalLimiter,
  securityHeaders,
  securityLogger,
  validateInput,
} = require('./middleware/security');

const authRoutes = require('./routes/auth');
const sociosRoutes = require('./routes/socios');
const adminRoutes = require('./routes/admin');
const mensajeriaRoutes = require('./routes/mensajeria');
const publicRoutes = require('./routes/public');

const app = express();
const port = config.server.port;
const host = config.server.host;
const publicBaseUrl = config.app.publicBaseUrl;
let httpServer = null;

// ==================== MIDDLEWARES ====================

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // styleSrc todavía con 'unsafe-inline' por las plantillas
        // existentes con style="..." inline. Endurecimiento futuro:
        // migrar a hashes/nonces (hallazgo BAJA auditoría 10 jun).
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        scriptSrc: ["'self'", 'https://unpkg.com'],
        connectSrc: ["'self'", publicBaseUrl],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    // HSTS más estricto + preload (precondición para preload list de Chrome)
    strictTransportSecurity: {
      maxAge: 63072000, // 2 años
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Permissions-Policy: deshabilita APIs del navegador que no usamos.
// Aplicar via middleware porque Helmet aún no la expone en su versión 8.
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()'
  );
  next();
});

app.use(securityHeaders);
app.use(securityLogger);
app.use(generalLimiter);
app.use(cors(config.cors));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(validateInput);
app.set('trust proxy', 1);

// ==================== ROUTES ====================

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/socios', sociosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/mensajeria', mensajeriaRoutes);
app.use('/api/public', publicRoutes);

const uploadsPath = path.resolve(config.uploads.path || './uploads');
app.use('/uploads', express.static(uploadsPath, { maxAge: '7d', fallthrough: true }));

// Páginas privadas: NO deben cachearse en proxies intermedios ni en el
// historial del navegador (hallazgo MEDIA auditoría 10 jun: admin.html
// se servía con Cache-Control: public, max-age=0). Aplicamos no-store
// a todas las páginas del área autenticada antes del static handler.
const PRIVATE_HTML = new Set([
  '/admin.html', '/panel.html', '/perfil.html',
  '/directorio.html', '/mensajes.html', '/restablecer.html'
]);
app.use((req, res, next) => {
  if (PRIVATE_HTML.has(req.path)) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
}

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));

  // Catch-all: las rutas inexistentes devuelven 404 (NO la SPA).
  // Antes /dashboard.html, /portal.html, /cualquier-cosa devolvían 200
  // con index.html como fallback — error de servidor que facilita el
  // fingerprinting y confunde a bots/buscadores. Sólo "/" y rutas API
  // explícitas sirven HTML.
  app.get('/{*path}', (req, res) => {
    if (req.path === '/' || req.path === '/index.html') {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      res.status(404).json({ error: 'Endpoint no encontrado' });
    } else {
      // HTML normal con 404 para rutas estáticas desconocidas.
      // Si más adelante quieres una página 404 bonita, sirve aquí
      // public/404.html en lugar de json.
      res.status(404).json({ error: 'Página no encontrada' });
    }
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      message: 'AGESPORT - Mapa del Talento API',
      version: '1.0.0',
      environment: 'development',
      endpoints: {
        health: '/health',
        auth: '/api/auth/*',
        socios: '/api/socios/*',
        admin: '/api/admin/*',
        mensajeria: '/api/mensajeria/*',
      },
      docs: 'Ver README.md para documentación completa',
    });
  });
}

// ==================== ERROR HANDLING ====================

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

app.use((error, req, res, _next) => {
  console.error('Error no manejado:', error);

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'JSON malformado en la petición' });
  }
  if (error.code === '23505') {
    return res.status(409).json({ error: 'El recurso ya existe' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'Referencia inválida en los datos' });
  }

  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

// ==================== GRACEFUL SHUTDOWN ====================

async function gracefulShutdown(signal) {
  console.log(`Iniciando apagado graceful del servidor (${signal})...`);
  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('Servidor HTTP cerrado');
    }
    await db.close();
    console.log('Conexiones de BD cerradas');
    console.log('Apagado graceful completado');
    process.exit(0);
  } catch (error) {
    console.error('Error en apagado graceful:', error);
    process.exit(1);
  }
}

// Sólo en runtime real, no durante tests, para no contaminar el runner
if (process.env.NODE_ENV !== 'test') {
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Promise Rejection:', reason);
    if (process.env.NODE_ENV === 'production') {
      gracefulShutdown('UNHANDLED_PROMISE_REJECTION');
    }
  });
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
  });
  ['SIGTERM', 'SIGINT', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, () => {
      console.log(`Recibida señal ${signal}, iniciando apagado graceful...`);
      gracefulShutdown(signal);
    });
  });
}

// ==================== START ====================

async function start() {
  try {
    await db.query('SELECT NOW()');
    httpServer = app.listen(port, host, () => {
      console.log('=====================================');
      console.log('AGESPORT - Mapa del Talento');
      console.log('=====================================');
      console.log(`Servidor ejecutándose en http://${host}:${port}`);
      console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log('Base de datos: Conectada');
      console.log(`PID: ${process.pid}`);
      console.log('=====================================');

      if (process.env.NODE_ENV === 'development') {
        console.log('');
        console.log('Endpoints disponibles:');
        console.log('   GET  /health');
        console.log('   POST /api/auth/register');
        console.log('   POST /api/auth/login/socio');
        console.log('   POST /api/auth/login/admin');
        console.log('   GET  /api/socios/directorio');
        console.log('   GET  /api/admin/socios/pendientes');
        console.log('   GET  /api/mensajeria/conversaciones');
        console.log('');
      }
    });
    httpServer.timeout = 30000;
  } catch (error) {
    console.error('Error iniciando servidor:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, start };
