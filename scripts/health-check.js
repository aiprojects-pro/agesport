#!/usr/bin/env node

// scripts/health-check.js
// Script para verificar la salud del sistema

const http = require('http');
const https = require('https');
const db = require('../config/database');

class HealthChecker {
  constructor() {
    this.checks = [];
    this.results = {};
  }

  addCheck(name, checkFunction) {
    this.checks.push({ name, check: checkFunction });
  }

  async runChecks() {
    console.log('🔍 Ejecutando checks de salud del sistema...\n');
    
    for (const { name, check } of this.checks) {
      try {
        console.log(`Verificando ${name}...`);
        const result = await check();
        this.results[name] = { status: 'OK', ...result };
        console.log(`✅ ${name}: OK`);
      } catch (error) {
        this.results[name] = { status: 'ERROR', error: error.message };
        console.log(`❌ ${name}: ${error.message}`);
      }
    }
    
    return this.results;
  }

  generateReport() {
    const allOK = Object.values(this.results).every(r => r.status === 'OK');
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 REPORTE DE SALUD DEL SISTEMA');
    console.log('='.repeat(50));
    
    for (const [name, result] of Object.entries(this.results)) {
      const status = result.status === 'OK' ? '✅' : '❌';
      console.log(`${status} ${name}: ${result.status}`);
      
      if (result.details) {
        console.log(`   ${result.details}`);
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    }
    
    console.log('='.repeat(50));
    console.log(`Estado general: ${allOK ? '✅ SALUDABLE' : '❌ PROBLEMAS DETECTADOS'}`);
    console.log('='.repeat(50));
    
    return allOK;
  }
}

// ===================================================================
// CHECKS ESPECÍFICOS
// ===================================================================

async function checkDatabase() {
  const start = Date.now();
  const result = await db.query('SELECT 1 as test, NOW() as timestamp');
  const duration = Date.now() - start;
  
  return {
    details: `Tiempo de respuesta: ${duration}ms`,
    timestamp: result.rows[0].timestamp
  };
}

async function checkDatabaseTables() {
  const tables = [
    'socios', 'rol_cluster', 'especialidades', 'disponibilidad',
    'proyectos_innovacion', 'consentimientos', 'conversaciones',
    'mensajes', 'administradores', 'auditoria'
  ];
  
  const counts = {};
  for (const table of tables) {
    const result = await db.query(`SELECT COUNT(*) as count FROM ${table}`);
    counts[table] = parseInt(result.rows[0].count);
  }
  
  return {
    details: `Tablas verificadas: ${Object.keys(counts).length}`,
    counts
  };
}

async function checkServer() {
  const config = require('../config/config');
  const port = config.port || 3001;
  const protocol = config.ssl ? https : http;
  
  return new Promise((resolve, reject) => {
    const req = protocol.request({
      hostname: 'localhost',
      port: port,
      path: '/health',
      method: 'GET',
      timeout: 5000
    }, (res) => {
      if (res.statusCode === 200) {
        resolve({ details: `Servidor respondiendo en puerto ${port}` });
      } else {
        reject(new Error(`HTTP ${res.statusCode}`));
      }
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Timeout')));
    req.end();
  });
}

async function checkDiskSpace() {
  const fs = require('fs').promises;
  
  try {
    const stats = await fs.stat('./');
    return {
      details: 'Acceso a sistema de archivos: OK'
    };
  } catch (error) {
    throw new Error('No se puede acceder al sistema de archivos');
  }
}

async function checkEnvironment() {
  const requiredVars = [
    'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    'JWT_SECRET', 'ENCRYPTION_KEY'
  ];
  
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    throw new Error(`Variables faltantes: ${missing.join(', ')}`);
  }
  
  return {
    details: `Variables de entorno configuradas: ${requiredVars.length}`
  };
}

// ===================================================================
// EJECUCIÓN PRINCIPAL
// ===================================================================

async function main() {
  const checker = new HealthChecker();
  
  // Registrar checks
  checker.addCheck('Variables de Entorno', checkEnvironment);
  checker.addCheck('Base de Datos - Conexión', checkDatabase);
  checker.addCheck('Base de Datos - Tablas', checkDatabaseTables);
  checker.addCheck('Servidor HTTP', checkServer);
  checker.addCheck('Sistema de Archivos', checkDiskSpace);
  
  // Ejecutar checks
  await checker.runChecks();
  
  // Generar reporte
  const allHealthy = checker.generateReport();
  
  // Exit code para scripts automatizados
  process.exit(allHealthy ? 0 : 1);
}

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Error no capturado:', error.message);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rechazada:', error.message);
  process.exit(1);
});

// Ejecutar si es llamado directamente
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error ejecutando health check:', error.message);
    process.exit(1);
  });
}

module.exports = { HealthChecker };
