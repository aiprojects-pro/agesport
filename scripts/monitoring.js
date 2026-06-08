#!/usr/bin/env node

// scripts/monitoring.js
// Sistema avanzado de monitoreo con alertas

const nodemailer = require('nodemailer');
const db = require('../config/database');
const fs = require('fs').promises;
const path = require('path');

class MonitoringSystem {
  constructor() {
    this.config = {
      checkInterval: 5 * 60 * 1000, // 5 minutos
      alertThresholds: {
        dbResponseTime: 1000, // ms
        memoryUsage: 80, // %
        diskUsage: 90, // %
        errorRate: 5, // errors per minute
        activeConnections: 100
      },
      alertCooldown: 30 * 60 * 1000, // 30 minutos
      logFile: './logs/monitoring.log'
    };
    
    this.lastAlerts = new Map();
    this.metrics = {
      checks: 0,
      errors: 0,
      alerts: 0,
      uptime: Date.now()
    };
    
    this.setupEmailTransporter();
  }

  async setupEmailTransporter() {
    if (process.env.EMAIL_HOST) {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    }
  }

  async log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data
    };
    
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
    
    try {
      await fs.appendFile(
        this.config.logFile,
        JSON.stringify(logEntry) + '\n'
      );
    } catch (error) {
      console.error('Error escribiendo log:', error.message);
    }
  }

  async checkDatabase() {
    const start = Date.now();
    
    try {
      // Test basic connection
      const result = await db.query('SELECT NOW() as timestamp, version() as version');
      const responseTime = Date.now() - start;
      
      // Check active connections
      const connectionsResult = await db.query(`
        SELECT count(*) as active_connections 
        FROM pg_stat_activity 
        WHERE state = 'active'
      `);
      
      const activeConnections = parseInt(connectionsResult.rows[0].active_connections);
      
      // Check database size
      const sizeResult = await db.query(`
        SELECT pg_size_pretty(pg_database_size($1)) as size
      `, [process.env.DB_NAME]);
      
      const metrics = {
        responseTime,
        activeConnections,
        size: sizeResult.rows[0].size,
        version: result.rows[0].version
      };
      
      // Check thresholds
      if (responseTime > this.config.alertThresholds.dbResponseTime) {
        await this.sendAlert('DATABASE_SLOW', 
          `Base de datos respondiendo lento: ${responseTime}ms`, 
          metrics
        );
      }
      
      if (activeConnections > this.config.alertThresholds.activeConnections) {
        await this.sendAlert('DATABASE_CONNECTIONS', 
          `Muchas conexiones activas: ${activeConnections}`, 
          metrics
        );
      }
      
      return { status: 'OK', metrics };
      
    } catch (error) {
      await this.sendAlert('DATABASE_DOWN', 
        `Error de base de datos: ${error.message}`, 
        { error: error.message }
      );
      throw error;
    }
  }

  async checkSystemResources() {
    try {
      const memInfo = await fs.readFile('/proc/meminfo', 'utf8');
      const memLines = memInfo.split('\n');
      
      const getMemValue = (key) => {
        const line = memLines.find(l => l.startsWith(key));
        return line ? parseInt(line.split(/\s+/)[1]) : 0;
      };
      
      const totalMem = getMemValue('MemTotal');
      const availableMem = getMemValue('MemAvailable');
      const memoryUsage = ((totalMem - availableMem) / totalMem * 100).toFixed(1);
      
      // Check disk usage
      const { execSync } = require('child_process');
      const diskInfo = execSync('df -h / | tail -1').toString();
      const diskUsage = parseInt(diskInfo.split(/\s+/)[4].replace('%', ''));
      
      const metrics = {
        memoryUsage: parseFloat(memoryUsage),
        diskUsage,
        totalMemory: `${Math.round(totalMem / 1024)}MB`,
        availableMemory: `${Math.round(availableMem / 1024)}MB`
      };
      
      // Check thresholds
      if (metrics.memoryUsage > this.config.alertThresholds.memoryUsage) {
        await this.sendAlert('HIGH_MEMORY', 
          `Alto uso de memoria: ${memoryUsage}%`, 
          metrics
        );
      }
      
      if (diskUsage > this.config.alertThresholds.diskUsage) {
        await this.sendAlert('HIGH_DISK', 
          `Alto uso de disco: ${diskUsage}%`, 
          metrics
        );
      }
      
      return { status: 'OK', metrics };
      
    } catch (error) {
      await this.log('error', 'Error checking system resources', { error: error.message });
      return { status: 'ERROR', error: error.message };
    }
  }

  async checkApplicationHealth() {
    try {
      const http = require('http');
      
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: process.env.PORT || 3001,
          path: '/health',
          method: 'GET',
          timeout: 5000
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve({ 
                status: 'OK', 
                metrics: { 
                  httpStatus: res.statusCode,
                  responseHeaders: res.headers
                }
              });
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => reject(new Error('Health check timeout')));
        req.end();
      });
      
    } catch (error) {
      await this.sendAlert('APP_DOWN', 
        `Aplicación no responde: ${error.message}`, 
        { error: error.message }
      );
      throw error;
    }
  }

  async checkErrorLogs() {
    try {
      const errorLogPath = './logs/error.log';
      
      try {
        const stats = await fs.stat(errorLogPath);
        const content = await fs.readFile(errorLogPath, 'utf8');
        
        // Count recent errors (last 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const recentErrors = content
          .split('\n')
          .filter(line => {
            if (!line.trim()) return false;
            try {
              const logEntry = JSON.parse(line);
              return new Date(logEntry.timestamp).getTime() > fiveMinutesAgo;
            } catch {
              return false;
            }
          });
        
        const errorRate = recentErrors.length;
        
        if (errorRate > this.config.alertThresholds.errorRate) {
          await this.sendAlert('HIGH_ERROR_RATE', 
            `Alta tasa de errores: ${errorRate} errores en los últimos 5 minutos`,
            { errorRate, recentErrors: recentErrors.slice(0, 5) }
          );
        }
        
        return { 
          status: 'OK', 
          metrics: { 
            errorRate,
            logSize: stats.size,
            lastModified: stats.mtime
          }
        };
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          return { status: 'OK', metrics: { errorRate: 0, message: 'No error log found' } };
        }
        throw error;
      }
      
    } catch (error) {
      await this.log('error', 'Error checking error logs', { error: error.message });
      return { status: 'ERROR', error: error.message };
    }
  }

  async sendAlert(type, message, data = null) {
    const alertKey = `${type}_${Math.floor(Date.now() / this.config.alertCooldown)}`;
    
    // Check cooldown
    if (this.lastAlerts.has(alertKey)) {
      return;
    }
    
    this.lastAlerts.set(alertKey, Date.now());
    this.metrics.alerts++;
    
    await this.log('alert', message, data);
    
    // Send email alert if configured
    if (this.emailTransporter && process.env.ALERT_EMAIL) {
      try {
        await this.emailTransporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
          to: process.env.ALERT_EMAIL,
          subject: `🚨 AGESPORT Alert: ${type}`,
          html: `
            <h2>🚨 Alerta del Sistema AGESPORT</h2>
            <p><strong>Tipo:</strong> ${type}</p>
            <p><strong>Mensaje:</strong> ${message}</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            ${data ? `<pre>${JSON.stringify(data, null, 2)}</pre>` : ''}
            <hr>
            <p><small>Mapa del Talento AGESPORT - Sistema de Monitoreo</small></p>
          `
        });
        
        await this.log('info', 'Email alert sent', { type, recipient: process.env.ALERT_EMAIL });
        
      } catch (error) {
        await this.log('error', 'Failed to send email alert', { error: error.message });
      }
    }
  }

  async runHealthCheck() {
    this.metrics.checks++;
    const startTime = Date.now();
    
    try {
      await this.log('info', 'Starting health check');
      
      const results = {
        timestamp: new Date().toISOString(),
        checks: {}
      };
      
      // Run all checks
      const checks = [
        { name: 'database', fn: () => this.checkDatabase() },
        { name: 'system', fn: () => this.checkSystemResources() },
        { name: 'application', fn: () => this.checkApplicationHealth() },
        { name: 'errorLogs', fn: () => this.checkErrorLogs() }
      ];
      
      for (const check of checks) {
        try {
          results.checks[check.name] = await check.fn();
        } catch (error) {
          results.checks[check.name] = { 
            status: 'ERROR', 
            error: error.message 
          };
          this.metrics.errors++;
        }
      }
      
      const duration = Date.now() - startTime;
      results.duration = duration;
      results.metrics = this.metrics;
      
      const allHealthy = Object.values(results.checks)
        .every(check => check.status === 'OK');
      
      await this.log('info', `Health check completed in ${duration}ms`, {
        healthy: allHealthy,
        checks: Object.keys(results.checks).length
      });
      
      return results;
      
    } catch (error) {
      this.metrics.errors++;
      await this.log('error', 'Health check failed', { error: error.message });
      throw error;
    }
  }

  async start() {
    await this.log('info', 'Starting monitoring system', {
      checkInterval: this.config.checkInterval,
      thresholds: this.config.alertThresholds
    });
    
    // Initial health check
    await this.runHealthCheck();
    
    // Schedule regular checks
    setInterval(async () => {
      try {
        await this.runHealthCheck();
      } catch (error) {
        console.error('Monitoring error:', error.message);
      }
    }, this.config.checkInterval);
    
    // Cleanup old alerts
    setInterval(() => {
      const cutoff = Date.now() - this.config.alertCooldown;
      for (const [key, timestamp] of this.lastAlerts.entries()) {
        if (timestamp < cutoff) {
          this.lastAlerts.delete(key);
        }
      }
    }, this.config.alertCooldown);
  }

  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.uptime,
      alertsActive: this.lastAlerts.size
    };
  }
}

// ===================================================================
// CLI EXECUTION
// ===================================================================

async function main() {
  const monitoring = new MonitoringSystem();
  
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'start':
      await monitoring.start();
      console.log('🔍 Sistema de monitoreo iniciado');
      // Keep process alive
      process.stdin.resume();
      break;
      
    case 'check': {
      const results = await monitoring.runHealthCheck();
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
      break;
    }
      
    case 'metrics': {
      const metrics = monitoring.getMetrics();
      console.log(JSON.stringify(metrics, null, 2));
      process.exit(0);
      break;
    }
      
    default:
      console.log(`
🔍 Sistema de Monitoreo AGESPORT

Comandos disponibles:
  node scripts/monitoring.js start   - Iniciar monitoreo continuo
  node scripts/monitoring.js check   - Ejecutar check único
  node scripts/monitoring.js metrics - Mostrar métricas

Variables de entorno opcionales:
  ALERT_EMAIL=admin@agesport.org     - Email para alertas
  
Ejemplo de uso en producción:
  pm2 start scripts/monitoring.js --name agesport-monitor -- start
      `);
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error en sistema de monitoreo:', error.message);
    process.exit(1);
  });
}

module.exports = { MonitoringSystem };
