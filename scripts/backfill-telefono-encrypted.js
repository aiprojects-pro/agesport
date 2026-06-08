// scripts/backfill-telefono-encrypted.js
//
// Cifra cualquier fila de `socios` que tenga `telefono` en claro pero
// `telefono_encrypted` nulo, dejando la BD lista para la migración 002.
// Idempotente: si la columna `telefono` ya no existe, no hace nada.

const { Client } = require('pg');
const config = require('../config/config');
const { encryptData } = require('../middleware/auth');

async function backfill() {
  const client = new Client(config.database);
  await client.connect();

  try {
    const { rows: colCheck } = await client.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'socios' AND column_name = 'telefono'`
    );
    if (colCheck.length === 0) {
      console.log('Columna socios.telefono ya no existe — nada que migrar.');
      return;
    }

    const { rows } = await client.query(
      `SELECT id, telefono FROM socios
       WHERE telefono IS NOT NULL AND telefono_encrypted IS NULL`
    );

    if (rows.length === 0) {
      console.log('No hay filas con teléfono en claro sin cifrar.');
      return;
    }

    console.log(`Cifrando ${rows.length} teléfonos...`);
    for (const row of rows) {
      const encrypted = encryptData(row.telefono);
      await client.query('UPDATE socios SET telefono_encrypted = $1 WHERE id = $2', [
        encrypted,
        row.id,
      ]);
    }
    console.log(`Backfill completado: ${rows.length} filas cifradas.`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  backfill().catch((err) => {
    console.error('Error en backfill:', err);
    process.exit(1);
  });
}

module.exports = backfill;
