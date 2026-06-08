#!/usr/bin/env node
// scripts/seed-demo.js
//
// Reseed para preview local: admin + 6 socios con coordenadas + 2 socios pendientes.
// Idempotente (ON CONFLICT DO NOTHING/UPDATE).
//
// Pensado para usar tras un `npm run test:integration` que limpia la BD,
// no para producción. Requiere las migraciones 002–009 aplicadas.

const db = require('../config/database');
const { hashPassword } = require('../middleware/auth');

async function main() {
  // Admin demo (no usar en producción)
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'LocalDemo123!';
  const passwordHash = await hashPassword(adminPassword);

  await db.query(
    `INSERT INTO administradores (email, password_hash, nombre, rol, activo)
     VALUES ($1, $2, 'Admin demo', 'superadmin', true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, activo = true`,
    [adminEmail, passwordHash]
  );

  // El primer socio tiene contraseña real (`LocalDemo123!`) para probar el
  // área privada en preview. El resto se quedan con un hash inválido — sirven
  // sólo como datos en mapa y directorio.
  const socioDemoPasswordHash = await hashPassword('LocalDemo123!');

  const socios = [
    ['socio.demo@example.com',     'Marina', 'Torres',     'Granada',   'Granada',  37.1773, -3.5986, socioDemoPasswordHash],
    ['demo.sevilla@example.com',   'Ana',    'García',     'Sevilla',   'Sevilla',  37.3886, -5.9823, 'x'],
    ['demo.madrid@example.com',    'Luis',   'Martínez',   'Madrid',    'Madrid',   40.4168, -3.7038, 'x'],
    ['demo.barcelona@example.com', 'María',  'López',      'Barcelona', 'Barcelona',41.3851,  2.1734, 'x'],
    ['demo.malaga@example.com',    'Pedro',  'Ruiz',       'Málaga',    'Málaga',   36.7213, -4.4214, 'x'],
    ['demo.bilbao@example.com',    'Iker',   'Etxeberria', 'Vizcaya',   'Bilbao',   43.2630, -2.9350, 'x'],
  ];
  for (const [email, nombre, apellidos, provincia, localidad, lat, lng, hash] of socios) {
    await db.query(
      `INSERT INTO socios (email, password_hash, nombre, apellidos, provincia, localidad,
                           estado, activo, latitud, longitud)
       VALUES ($1, $8, $2, $3, $4, $5, 'aprobado', true, $6, $7)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, nombre, apellidos, provincia, localidad, lat, lng, hash]
    );
  }

  // Consentimientos mínimos para socio.demo (mensajería + visibilidad).
  // consentimientos no tiene UNIQUE en socio_id, así que evitamos duplicar
  // con un WHERE NOT EXISTS explícito.
  await db.query(
    `INSERT INTO consentimientos
       (socio_id, acepta_mapa_interactivo, acepta_visibilidad_datos, acepta_mensajeria,
        acepta_notificaciones_email, visible_telefono, visible_email_directo,
        visible_direccion_completa, visible_web_profesional, visible_linkedin)
     SELECT s.id, true, true, true, true, true, true, false, true, true
       FROM socios s
       WHERE s.email = 'socio.demo@example.com'
         AND NOT EXISTS (SELECT 1 FROM consentimientos c WHERE c.socio_id = s.id)`
  );

  // 2 socios pendientes (para probar la pestaña Pendientes)
  const pendientes = [
    ['pendiente.1@example.com', 'Carla',      'Diaz',            'Sevilla', 'Sevilla'],
    ['pendiente.2@example.com', 'maria jose', 'pedrosa carrera', 'Sevilla', 'Sevilla'],
  ];
  for (const [email, nombre, apellidos, provincia, localidad] of pendientes) {
    await db.query(
      `INSERT INTO socios (email, password_hash, nombre, apellidos, provincia, localidad,
                           estado, activo)
       VALUES ($1, 'x', $2, $3, $4, $5, 'pendiente', true)
       ON CONFLICT (email) DO NOTHING`,
      [email, nombre, apellidos, provincia, localidad]
    );
  }

  console.log(`[seed:demo] OK. Admin: ${adminEmail} / ${adminPassword}`);
  console.log(`[seed:demo] 6 socios aprobados con coordenadas + 2 pendientes sembrados.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed:demo] Error:', err.message);
    process.exit(1);
  });
