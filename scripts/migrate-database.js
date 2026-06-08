// scripts/migrate-database.js
//
// Aplica todas las migraciones de `database/migrations/*.sql` en orden
// alfabético (001, 002, …). Cada migración aplicada se anota en la
// tabla `_migrations` para no repetirla. Cada migración SE EJECUTA EN
// SU PROPIA TRANSACCIÓN — si una falla, las demás no se aplican y el
// usuario puede arreglar el problema y reintentar.
//
// Convención de naming: NNN_descripcion.sql, donde NNN es un número
// monotónicamente creciente. Las migraciones son IDEMPOTENTES (usan
// IF NOT EXISTS, DO blocks con guards, ON CONFLICT DO NOTHING). Esto
// significa que reaplicar una migración ya marcada como ejecutada
// debería ser un no-op aunque saltase el registro.
//
// Uso:
//   npm run db:migrate
//   PGSSLMODE=require npm run db:migrate (en hosting cloud)

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const MIGRATIONS_DIR = path.resolve(__dirname, '../database/migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Compatibilidad con el inicializador OKD anterior, que creó esta tabla
  // usando la columna `name`.
  await client.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '_migrations'
          AND column_name = 'name'
      ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = '_migrations'
          AND column_name = 'filename'
      ) THEN
        ALTER TABLE _migrations RENAME COLUMN name TO filename;
      END IF;
    END $$;
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query('SELECT filename FROM _migrations');
  return new Set(res.rows.map((r) => r.filename));
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

// Stripea líneas `BEGIN;` / `COMMIT;` standalone (con espacios opcionales)
// de la migración. Postgres NO trata BEGIN anidado como savepoint —
// emite WARNING y lo ignora, y luego el COMMIT interno cierra
// prematuramente el outer BEGIN, dejando el INSERT en `_migrations` en
// autocommit. Si la conexión cae entre el COMMIT interno y el INSERT,
// la migración queda aplicada pero NO registrada — y el runner la
// re-aplicaría en el siguiente arranque.
//
// Estrategia: el runner es quien posee la atomicidad; las migraciones
// no deberían incluir BEGIN/COMMIT. Pero como algunas las traen
// históricamente y queremos seguir pudiendo aplicarlas a mano con
// `psql -f`, las quitamos aquí antes de ejecutar.
function stripStandaloneTxMarkers(sql) {
  return sql
    .split('\n')
    .filter((line) => !/^\s*(BEGIN|COMMIT)\s*;\s*(--.*)?$/i.test(line))
    .join('\n');
}

async function applyMigration(client, filename) {
  const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
  const sql = stripStandaloneTxMarkers(raw);

  // Ahora la tx la posee el runner, sin riesgo de BEGIN/COMMIT anidado.
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function migrate() {
  const client = new Client(config.database);
  await client.connect();
  console.log(`[migrate] conectado a ${config.database.database}`);

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = listMigrationFiles();

    if (files.length === 0) {
      console.log('[migrate] no se encontraron migraciones');
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log(`[migrate] ${applied.size} migraciones ya aplicadas, nada que hacer`);
      return;
    }

    console.log(`[migrate] ${pending.length} migración(es) pendiente(s):`);
    for (const f of pending) console.log(`  - ${f}`);

    for (const f of pending) {
      process.stdout.write(`[migrate] aplicando ${f} ... `);
      try {
        await applyMigration(client, f);
        console.log('OK');
      } catch (err) {
        console.log('FALLO');
        console.error(`[migrate] error en ${f}:`, err.message);
        process.exit(1);
      }
    }
    console.log('[migrate] todas las migraciones aplicadas');
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  migrate().catch((err) => {
    console.error('[migrate] error fatal:', err);
    process.exit(1);
  });
}

module.exports = migrate;
