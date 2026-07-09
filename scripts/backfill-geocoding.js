#!/usr/bin/env node
// Rellena latitud/longitud en los socios aprobados que aún no las tienen.
// Uso puntual: tras aplicar la geocodificación por localidad a todos
// los flujos (register/aprobación/updatePerfil), los socios ya
// existentes en BD no tienen coords. Este script les asigna una
// coordenada a nivel de MUNICIPIO (localidad + provincia) usando
// Nominatim.
//
// Uso:  npm run db:geocode
//       node scripts/backfill-geocoding.js
//
// Respeta el rate limit "1 req/s" de Nominatim.

require('dotenv').config();
const db = require('../config/database');
const geocodingService = require('../services/geocodingService');

async function main() {
  const { rows } = await db.query(`
    SELECT id, nombre, apellidos, localidad, provincia
    FROM socios
    WHERE latitud IS NULL
      AND localidad IS NOT NULL
      AND provincia IS NOT NULL
    ORDER BY id
  `);
  console.log('Sin coords:', rows.length);
  if (rows.length === 0) { process.exit(0); }

  let ok = 0, fail = 0;
  for (const s of rows) {
    const q = `${s.localidad}, ${s.provincia}, España`;
    try {
      const coords = await geocodingService.geocode(q);
      if (coords) {
        await db.query('UPDATE socios SET latitud = $1, longitud = $2 WHERE id = $3',
          [coords.lat, coords.lng, s.id]);
        ok++;
        console.log(`  ✓ ${s.id} ${s.nombre} — ${q} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      } else {
        fail++;
        console.warn(`  ✗ ${s.id} ${s.nombre} — no encontrado: ${q}`);
      }
    } catch (e) {
      fail++;
      console.warn(`  ✗ ${s.id}: ${e.message}`);
    }
    // 1 req/s por rate limit Nominatim
    await new Promise((r) => setTimeout(r, 1100));
  }
  console.log(`\nOK: ${ok}   Fallos: ${fail}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
