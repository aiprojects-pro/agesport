module.exports = {
  apps: [{
    name: 'mapa-talento-agesport',
    script: './server.js',
    instances: 'max', // Usar todos los cores disponibles
    exec_mode: 'cluster',
    
    // Variables de entorno específicas para PM2
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },
    
    // Configuración de logs
    log_file: './logs/app.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Auto-restart en caso de crash
    autorestart: true,
    watch: false, // No usar watch en producción
    
    // Configuración de memoria
    max_memory_restart: '512M',
    
    // Configuración de reinicio
    min_uptime: '10s',
    max_restarts: 10,
    
    // Configuración de cluster
    kill_timeout: 5000,
    listen_timeout: 8000,
    
    // Configuración de deployment
    source_map_support: false,
    
    // Configuración adicional
    node_args: '--max-old-space-size=512'
  }],

  // Configuración de deployment (opcional)
  deploy: {
    production: {
      user: 'deploy',
      host: 'tu-servidor.com',
      ref: 'origin/main',
      repo: 'git@github.com:tu-usuario/mapa-talento-agesport.git',
      path: '/var/www/mapa-talento-agesport',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production'
    }
  }
};
