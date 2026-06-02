#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config/config');

const root = path.join(__dirname, '..');
const schemaPath = path.join(root, 'database', 'schema.sql');
const migrationsDir = path.join(root, 'database', 'migrations');

async function tableExists(client, tableName) {
  const result = await client.query(
    "SELECT to_regclass($1) AS name",
    [`public.${tableName}`],
  );
  return !!result.rows[0]?.name;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function applyMigrations(client) {
  await ensureMigrationsTable(client);
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const seen = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
    if (seen.rowCount) {
      console.log(`[db:init] migration already applied: ${file}`);
      continue;
    }

    console.log(`[db:init] applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
  }
}

async function upsertInitialAdmin(client) {
  const email = process.env.ADMIN_INITIAL_EMAIL || 'admin@agesport.org';
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  const name = process.env.ADMIN_INITIAL_NAME || 'Administrador AGESPORT';

  if (!password || password.length < 8) {
    throw new Error('ADMIN_INITIAL_PASSWORD must be set and have at least 8 chars');
  }

  const hash = await bcrypt.hash(password, 12);
  await client.query(`
    INSERT INTO administradores (email, password_hash, nombre, rol, activo)
    VALUES ($1, $2, $3, 'superadmin', true)
    ON CONFLICT (email) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          nombre = EXCLUDED.nombre,
          rol = EXCLUDED.rol,
          activo = true
  `, [email, hash, name]);

  await client.query(`
    DELETE FROM administradores
    WHERE email = 'admin@agesport.org'
      AND password_hash = '$2b$12$example_hash_change_in_production'
  `);

  console.log(`[db:init] admin ready: ${email}`);
}

async function main() {
  let client;
  for (let attempt = 1; ; attempt++) {
    try {
      client = new Client(config.database);
      await client.connect();
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      console.log(`[db:init] waiting for database (${attempt}/30): ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
  try {
    await client.query('SELECT PostGIS_Version()');

    const hasAdmins = await tableExists(client, 'administradores');
    if (!hasAdmins) {
      console.log('[db:init] applying base schema');
      await client.query(fs.readFileSync(schemaPath, 'utf8'));
    } else {
      console.log('[db:init] base schema already present');
    }

    await applyMigrations(client);
    await upsertInitialAdmin(client);
    console.log('[db:init] complete');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[db:init] failed:', error);
  process.exit(1);
});
