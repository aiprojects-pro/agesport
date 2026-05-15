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
  validateInput 
} = require('./middleware/security');

// Importar rutas
const authRoutes = require('./routes/auth');
const sociosRoutes = require('./routes/socios');
const adminRoutes = require('./routes/admin');
const mensajeriaRoutes = require('./routes/mensajeria');

class Server {
  constructor() {
    this.app = express();
    this.port = config.server.port;
    this.host = config.server.host;
    this.publicBaseUrl = config.app.publicBaseUrl;
    
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  setupMiddlewares() {
    // Logging
    if (process.env.NODE_ENV === 'development') {
      this.app.use(morgan('dev'));
    } else {
      this.app.use(morgan('combined'));
    }

    // Seguridad
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          scriptSrc: ["'self'", "https://unpkg.com"],
          connectSrc: ["'self'", this.publicBaseUrl]
        }
      }
    }));

    this.app.use(securityHeaders);
    this.app.use(securityLogger);
    this.app.use(generalLimiter);

    // CORS
    this.app.use(cors(config.cors));

    // Compresión
    this.app.use(compression());

    // Parser de body y cookies
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use(cookieParser());

    // Validación de entrada general
    this.app.use(validateInput);

    // IP forwarding para proxies
    this.app.set('trust proxy', 1);
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0'
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/socios', sociosRoutes);
    this.app.use('/api/admin', adminRoutes);
    this.app.use('/api/mensajeria', mensajeriaRoutes);

    // Servir uploads (fotos perfil, CVs, logos org) — disponible en dev y prod
    const uploadsPath = path.resolve(config.uploads.path || './uploads');
    this.app.use('/uploads', express.static(uploadsPath, {
      maxAge: '7d',
      fallthrough: true
    }));

    // En desarrollo, servir también /assets para que los HTML carguen CSS/JS estáticos
    if (process.env.NODE_ENV !== 'production') {
      this.app.use(express.static(path.join(__dirname, 'public')));
    }

    // Servir archivos estáticos del frontend (en producción)
    if (process.env.NODE_ENV === 'production') {
      this.app.use(express.static(path.join(__dirname, 'public')));
      
      // SPA fallback - todas las rutas no API devuelven index.html
      this.app.get('/{*path}', (req, res) => {
        if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/')) {
          res.sendFile(path.join(__dirname, 'public', 'index.html'));
        } else {
          res.status(404).json({ error: 'Endpoint no encontrado' });
        }
      });
    } else {
      // En desarrollo, mensaje de bienvenida
      this.app.get('/', (req, res) => {
        res.json({
          message: '🏆 AGESPORT - Mapa del Talento API',
          version: '1.0.0',
          environment: 'development',
          endpoints: {
            health: '/health',
            auth: '/api/auth/*',
            socios: '/api/socios/*',
            admin: '/api/admin/*',
            mensajeria: '/api/mensajeria/*'
          },
          docs: 'Ver README.md para documentación completa'
        });
      });
    }
  }

  setupErrorHandling() {
    // Manejar errores 404
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Endpoint no encontrado',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // Manejador de errores global
    this.app.use((error, req, res, next) => {
      console.error('💥 Error no manejado:', error);

      // Error de validación de JSON
      if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        return res.status(400).json({
          error: 'JSON malformado en la petición'
        });
      }

      // Error de base de datos
      if (error.code === '23505') { // Violación unique constraint
        return res.status(409).json({
          error: 'El recurso ya existe'
        });
      }

      if (error.code === '23503') { // Violación foreign key
        return res.status(400).json({
          error: 'Referencia inválida en los datos'
        });
      }

      // Error genérico
      res.status(error.status || 500).json({
        error: process.env.NODE_ENV === 'production' 
          ? 'Error interno del servidor' 
          : error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
      });
    });

    // Manejar promesas rechazadas no capturadas
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled Promise Rejection:', reason);
      if (process.env.NODE_ENV === 'production') {
        // En producción, reiniciar el proceso después de limpiar conexiones
        this.gracefulShutdown('UNHANDLED_PROMISE_REJECTION');
      }
    });

    // Manejar excepciones no capturadas
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught Exception:', error);
      this.gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
  }

  setupGracefulShutdown() {
    // Señales de termination
    const signals = ['SIGTERM', 'SIGINT', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, () => {
        console.log(`📡 Recibida señal ${signal}, iniciando apagado graceful...`);
        this.gracefulShutdown(signal);
      });
    });
  }

  async gracefulShutdown(signal) {
    console.log('🔄 Iniciando apagado graceful del servidor...');
    
    try {
      // Cerrar servidor HTTP
      if (this.httpServer) {
        await new Promise((resolve) => {
          this.httpServer.close(resolve);
        });
        console.log('✅ Servidor HTTP cerrado');
      }

      // Cerrar conexiones de base de datos
      await db.close();
      console.log('✅ Conexiones de BD cerradas');

      console.log('✅ Apagado graceful completado');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error en apagado graceful:', error);
      process.exit(1);
    }
  }

  async start() {
    try {
      // Verificar conexión a BD al inicio
      await db.query('SELECT NOW()');
      
      this.httpServer = this.app.listen(this.port, this.host, () => {
        console.log('🚀 =====================================');
        console.log('🏆 AGESPORT - Mapa del Talento');
        console.log('🚀 =====================================');
        console.log(`📡 Servidor ejecutándose en http://${this.host}:${this.port}`);
        console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🗄️  Base de datos: Conectada`);
        console.log(`⚡ PID: ${process.pid}`);
        console.log('🚀 =====================================');
        
        if (process.env.NODE_ENV === 'development') {
          console.log('');
          console.log('📋 Endpoints disponibles:');
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

      // Timeout para conexiones inactivas
      this.httpServer.timeout = 30000; // 30 segundos
      
    } catch (error) {
      console.error('💥 Error iniciando servidor:', error);
      process.exit(1);
    }
  }
}

// Iniciar servidor si este archivo se ejecuta directamente
if (require.main === module) {
  const server = new Server();
  server.start();
}

module.exports = Server;
