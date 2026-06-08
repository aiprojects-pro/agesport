// test/integration/_setup.js
//
// Helpers compartidos por los tests de integración. Asumen que el contenedor
// `agesport-postgres-test` está corriendo (lo levanta `pretest:integration`).
//
// Cada `resetTestDb()` deja la BD vacía y con todas las migraciones aplicadas.

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const TEST_DB_CONFIG = {
  host: '127.0.0.1',
  port: 5433,
  database: 'agesport_test',
  user: 'postgres',
  password: 'test_password',
};

function setTestEnv() {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = TEST_DB_CONFIG.host;
  process.env.DB_PORT = String(TEST_DB_CONFIG.port);
  process.env.DB_NAME = TEST_DB_CONFIG.database;
  process.env.DB_USER = TEST_DB_CONFIG.user;
  process.env.DB_PASSWORD = TEST_DB_CONFIG.password;
  process.env.JWT_SECRET = 'test-jwt-secret-of-many-chars-xxxxxx';
  process.env.ENCRYPTION_KEY = 'a-test-key-of-exactly-32-chars--';
  process.env.PORT = '0';
  // Limitadores generosos para no bloquear tests
  process.env.RATE_LIMIT_REGISTER_MAX = '10000';
  process.env.RATE_LIMIT_AUTH_MAX = '10000';
  process.env.RATE_LIMIT_MAX_REQUESTS = '10000';
}

async function seedAdmin(email = 'admin@test.local', password = 'AdminTest123!', rol = 'superadmin') {
  const bcrypt = require('bcryptjs');
  const client = new Client(TEST_DB_CONFIG);
  await client.connect();
  try {
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO administradores (email, password_hash, nombre, rol)
       VALUES ($1, $2, $3, $4)`,
      [email, hash, 'Test Admin', rol]
    );
  } finally {
    await client.end();
  }
  return { email, password, rol };
}

async function approveSocioDirectly(socioId) {
  const client = new Client(TEST_DB_CONFIG);
  await client.connect();
  try {
    await client.query(`UPDATE socios SET estado = 'aprobado' WHERE id = $1`, [socioId]);
  } finally {
    await client.end();
  }
}

async function resetTestDb() {
  const client = new Client(TEST_DB_CONFIG);
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO postgres');

    // Auto-discover migraciones para que tests NUNCA se queden atrás cuando
    // se añade una nueva. Antes, la lista era hand-curated y la 013 se nos
    // olvidó — la rama de dedup quedaba sin cobertura.
    const migrationsDir = path.resolve(__dirname, '../../database/migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // 001_... 002_... etc

    const filesToApply = [
      path.resolve(__dirname, '../../database/schema.sql'),
      ...migrationFiles.map((f) => path.join(migrationsDir, f)),
    ];
    for (const f of filesToApply) {
      const sql = fs.readFileSync(f, 'utf8');
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

function getTestApp() {
  // Importar DESPUÉS de setTestEnv()
  const { app } = require('../../server');
  return app;
}

module.exports = {
  setTestEnv,
  resetTestDb,
  seedAdmin,
  approveSocioDirectly,
  getTestApp,
  TEST_DB_CONFIG,
};
