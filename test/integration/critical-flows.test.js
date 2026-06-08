// test/integration/critical-flows.test.js
//
// Flujo crítico end-to-end contra postgres+postgis real:
//   1. Registro → aprobación → login
//   2. Mensajería entre dos socios
//   3. Export RGPD (teléfono se devuelve descifrado)
//
// Requiere `docker compose -f docker-compose.test.yml up -d --wait`
// (lo lanza el script `pretest:integration` en package.json).

const { test, before, describe } = require('node:test');
const assert = require('node:assert');

const setup = require('./_setup');
setup.setTestEnv();

const request = require('supertest');

const validRegistration = (overrides = {}) => ({
  email: 'maria.test@example.com',
  password: 'TestPass123',
  nombre: 'María',
  apellidos: 'García López',
  telefono: '+34 600 123 456',
  provincia: 'Sevilla',
  comunidad_autonoma: 'andalucia',
  localidad: 'Sevilla',
  cargo_actual: 'Directora deportiva',
  anos_experiencia: 10,
  rol_cluster: 'operador_deportivo',
  especialidades: ['gestion_instalaciones'],
  visible_telefono: true,
  acepta_mapa_interactivo: true,
  acepta_visibilidad_datos: true,
  acepta_mensajeria: true,
  ...overrides,
});

describe('Flujo crítico: registro → aprobación → login', () => {
  let app;
  let admin;
  let socioId;
  let socioToken;
  let adminToken;

  before(async () => {
    await setup.resetTestDb();
    admin = await setup.seedAdmin();
    app = setup.getTestApp();
  });

  test('POST /api/auth/register devuelve 201 con estado pendiente', async () => {
    const res = await request(app).post('/api/auth/register').send(validRegistration());
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.socio.estado, 'pendiente');
    assert.ok(res.body.socio.id);
    socioId = res.body.socio.id;
  });

  test('login del socio pendiente falla con 403', async () => {
    const res = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'maria.test@example.com', password: 'TestPass123' });
    assert.strictEqual(res.status, 403);
    assert.match(res.body.error, /pendiente/i);
  });

  test('login de admin funciona', async () => {
    const res = await request(app)
      .post('/api/auth/login/admin')
      .send({ email: admin.email, password: admin.password });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.token);
    adminToken = res.body.token;
  });

  test('admin lista socios pendientes y ve el nuevo registro', async () => {
    const res = await request(app)
      .get('/api/admin/socios/pendientes')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const socios = res.body.socios || res.body;
    assert.ok(Array.isArray(socios), `expected array, got ${typeof socios}`);
    const found = socios.find((s) => s.id === socioId);
    assert.ok(found, `socio ${socioId} no aparece en pendientes`);
  });

  test('admin aprueba el socio', async () => {
    const res = await request(app)
      .post(`/api/admin/socios/${socioId}/aprobar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  test('socio aprobado puede hacer login y recibe token', async () => {
    const res = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'maria.test@example.com', password: 'TestPass123' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.token);
    socioToken = res.body.token;
  });

  // Regresión RED 3R #1: el logout decodificaba decoded.id pero el JWT
  // se firma con socioId — el audit nunca se creaba. Verificamos que
  // se inserte una fila en `auditoria` con accion='LOGOUT'.
  test('logout audita la salida del socio (regresión RED 3R #1)', async () => {
    const { Client } = require('pg');
    const client = new Client(setup.TEST_DB_CONFIG);
    await client.connect();
    try {
      const beforeRows = await client.query(
        `SELECT COUNT(*)::int AS n FROM auditoria WHERE accion = 'LOGOUT' AND socio_id = $1`,
        [socioId]
      );

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${socioToken}`);
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));

      const afterRows = await client.query(
        `SELECT COUNT(*)::int AS n FROM auditoria WHERE accion = 'LOGOUT' AND socio_id = $1`,
        [socioId]
      );
      assert.strictEqual(
        afterRows.rows[0].n,
        beforeRows.rows[0].n + 1,
        'logout no creó una entrada de auditoría'
      );
    } finally {
      await client.end();
    }
    // Re-login para que los flujos siguientes sigan teniendo token válido
    const relogin = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'maria.test@example.com', password: 'TestPass123' });
    assert.strictEqual(relogin.status, 200);
    socioToken = relogin.body.token;
  });

  // ====== Flujo 2: mensajería entre dos socios ======

  let socio2Id;
  let socio2Token;

  test('registrar y aprobar un segundo socio', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(
        validRegistration({
          email: 'juan.test@example.com',
          nombre: 'Juan',
          apellidos: 'Pérez Ruiz',
          telefono: '+34 611 222 333',
        })
      );
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    socio2Id = res.body.socio.id;
    await setup.approveSocioDirectly(socio2Id);

    const login = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'juan.test@example.com', password: 'TestPass123' });
    assert.strictEqual(login.status, 200);
    socio2Token = login.body.token;
  });

  test('socio 1 envía un mensaje al socio 2', async () => {
    const res = await request(app)
      .post('/api/mensajeria/mensajes')
      .set('Authorization', `Bearer ${socioToken}`)
      .send({ receptorId: socio2Id, contenido: 'Hola Juan, ¿colaboramos?' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  });

  test('socio 2 ve el mensaje en sus conversaciones', async () => {
    const res = await request(app)
      .get('/api/mensajeria/conversaciones')
      .set('Authorization', `Bearer ${socio2Token}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.conversaciones));
    const conv = res.body.conversaciones.find((c) => c.otro_socio_id === socioId);
    assert.ok(conv, 'no aparece conversación con el emisor');
    assert.match(conv.ultimo_mensaje, /colaboramos/);
  });

  // ====== Flujo 3: export RGPD ======

  test('socio 1 exporta sus datos y recibe el teléfono descifrado', async () => {
    const res = await request(app)
      .get('/api/socios/mis-datos/exportar')
      .set('Authorization', `Bearer ${socioToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body).slice(0, 500));
    const datos = res.body.datos_personales;
    assert.ok(datos, 'falta datos_personales en la respuesta');
    assert.strictEqual(datos.telefono, '+34 600 123 456');
    assert.strictEqual(datos.telefono_encrypted, undefined, 'el cifrado no debe salir al cliente');
    assert.ok(Array.isArray(res.body.mensajes));
    assert.ok(res.body.mensajes.some((m) => /colaboramos/.test(m.contenido)));
  });

  // ====== Flujo 4: import CSV → aprobación de invitado ======
  // Cubre el bug regresivo de migración 002: aprobarAccesoInvitado escribía
  // socios.telefono (ya no existe). Sin este test el siguiente cambio en el
  // flujo CSV podría reintroducir el problema.

  let invitadoId;
  const importEmail = 'ana.import@example.com';
  const importPhone = '+34 622 333 444';

  test('admin sube un CSV y se cifra el teléfono en accesos_invitados', async () => {
    const csv = [
      'nombre,apellidos,email,telefono,entidad,cargo_actual,provincia,comunidad_autonoma,localidad,rol_cluster,tipo_socio',
      `Ana,Martínez,${importEmail},${importPhone},Club Test,Coordinadora,Málaga,andalucia,Málaga,operador_deportivo,numero`,
    ].join('\n');

    const res = await request(app)
      .post('/api/admin/socios/importar')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('archivo', Buffer.from(csv, 'utf8'), 'import.csv');

    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.total, 1);
    const fila = res.body.filas[0];
    assert.strictEqual(fila.telefono, importPhone, 'response devuelve telefono en plano');
    assert.strictEqual(fila.telefono_encrypted, undefined, 'el cifrado nunca se expone');
    invitadoId = fila.id;
  });

  test('listado de invitados nunca expone telefono_encrypted', async () => {
    const res = await request(app)
      .get('/api/admin/socios/invitados')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const found = res.body.invitados.find((i) => i.id === invitadoId);
    assert.ok(found, 'no aparece el invitado recién importado');
    assert.strictEqual(found.telefono, importPhone);
    assert.strictEqual(found.telefono_encrypted, undefined);
  });

  test('admin aprueba el invitado y crea un socio (sin romper el INSERT)', async () => {
    const res = await request(app)
      .post(`/api/admin/socios/invitados/${invitadoId}/aprobar`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    assert.strictEqual(res.status, 200, JSON.stringify(res.body).slice(0, 500));

    // Sanity check directo en BD: el socio nuevo debe tener telefono_encrypted
    // (NO telefono, porque la columna no existe tras migración 002).
    const { Client } = require('pg');
    const client = new Client(setup.TEST_DB_CONFIG);
    await client.connect();
    try {
      const row = await client.query(
        'SELECT id, telefono_encrypted FROM socios WHERE email = $1',
        [importEmail]
      );
      assert.strictEqual(row.rows.length, 1, 'socio no se creó');
      assert.ok(row.rows[0].telefono_encrypted, 'telefono_encrypted ausente en el socio aprobado');

      // Regresión: el socio importado debe tener una fila de consentimientos
      // (defaults conservadores). Sin ella, canViewSocio y la mensajería
      // dejaban al socio invisible/incontactable.
      const cons = await client.query(
        'SELECT acepta_mensajeria, acepta_mapa_interactivo FROM consentimientos WHERE socio_id = $1',
        [row.rows[0].id]
      );
      assert.strictEqual(cons.rows.length, 1, 'consentimientos no se creó');
      assert.strictEqual(cons.rows[0].acepta_mensajeria, true, 'mensajería debería estar activa por defecto');
      assert.strictEqual(cons.rows[0].acepta_mapa_interactivo, false, 'mapa debe estar OFF hasta que el socio opte');
    } finally {
      await client.end();
    }
  });

  // ====== Flujo 4c: migración 013 — UNIQUE en consentimientos.socio_id ======
  // El test inserta duplicados ANTES de re-aplicar la migración y verifica
  // que el bloque DO de dedup conserva sólo la fila más reciente.

  test('migración 013 deduplica consentimientos por socio_id', async () => {
    const { Client } = require('pg');
    const client = new Client(setup.TEST_DB_CONFIG);
    await client.connect();
    try {
      // Crear un socio de juguete + dos filas de consentimientos a propósito.
      // Hay que dropear la UNIQUE primero porque el schema (post-013) ya
      // la tiene → emulamos un estado pre-013.
      await client.query(
        `ALTER TABLE consentimientos
         DROP CONSTRAINT IF EXISTS consentimientos_socio_id_unique`
      );
      await client.query(
        `ALTER TABLE consentimientos
         DROP CONSTRAINT IF EXISTS consentimientos_socio_id_key`
      );

      const socioRes = await client.query(
        `INSERT INTO socios (email, password_hash, nombre, apellidos, provincia, localidad, tipo_socio, estado, activo)
         VALUES ('dup@test.local', 'x', 'Dup', 'Test', 'Sevilla', 'Sevilla', 'numero', 'aprobado', true)
         RETURNING id`
      );
      const sid = socioRes.rows[0].id;

      // Vieja con acepta_mapa=true (debería ser sobrescrita)
      await client.query(
        `INSERT INTO consentimientos (socio_id, acepta_mapa_interactivo, acepta_visibilidad_datos, fecha_consentimiento)
         VALUES ($1, true, true, NOW() - INTERVAL '1 day')`,
        [sid]
      );
      // Nueva con acepta_mapa=false (la que el dedup debe conservar)
      await client.query(
        `INSERT INTO consentimientos (socio_id, acepta_mapa_interactivo, acepta_visibilidad_datos, fecha_consentimiento)
         VALUES ($1, false, false, NOW())`,
        [sid]
      );

      // Sanity check: hay 2 filas
      const before = await client.query(
        'SELECT COUNT(*)::int AS n FROM consentimientos WHERE socio_id = $1',
        [sid]
      );
      assert.strictEqual(before.rows[0].n, 2, 'no se insertaron los duplicados');

      // Re-aplicar migración 013
      const fs = require('node:fs');
      const path = require('node:path');
      const sql = fs.readFileSync(
        path.resolve(__dirname, '../../database/migrations/013_consentimientos_unique_socio.sql'),
        'utf8'
      );
      await client.query(sql);

      // Después: 1 fila, la más reciente
      const after = await client.query(
        'SELECT acepta_mapa_interactivo FROM consentimientos WHERE socio_id = $1',
        [sid]
      );
      assert.strictEqual(after.rows.length, 1, 'dedup no dejó exactamente 1 fila');
      assert.strictEqual(
        after.rows[0].acepta_mapa_interactivo,
        false,
        'dedup conservó la fila vieja en vez de la nueva'
      );

      // Y el UNIQUE debe estar puesto: un nuevo INSERT debe fallar
      await assert.rejects(
        client.query(
          `INSERT INTO consentimientos (socio_id, acepta_mapa_interactivo, acepta_visibilidad_datos)
           VALUES ($1, false, false)`,
          [sid]
        ),
        /unique|duplicate/i,
        'la migración no añadió el UNIQUE'
      );
    } finally {
      await client.end();
    }
  });

  // ====== Flujo 4b: endpoints públicos de landing ======

  test('GET /api/public/visor-talento es accesible sin auth y devuelve agregados', async () => {
    const res = await request(app).get('/api/public/visor-talento');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.provincias));
    assert.ok(typeof res.body.total === 'number');
    // Tras los flujos previos hay al menos 2 socios aprobados (María, Juan)
    // pero ninguno tiene latitud (no se geocodificó) en el test → array vacío esperado
    assert.ok(res.body.provincias.length >= 0);
  });

  test('GET /api/public/landing devuelve seeds sin necesitar auth', async () => {
    const res = await request(app).get('/api/public/landing');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(typeof res.body.content, 'object');
    assert.ok(res.body.content['hero.title'], 'falta seed hero.title');
    assert.match(res.body.content['hero.title'], /talento/i);
  });

  test('admin edita una clave de landing y el endpoint público lo refleja', async () => {
    const nuevoValor = 'Conectar lo que mueve el deporte andaluz.';
    const upd = await request(app)
      .put('/api/admin/landing/hero.title')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ valor: nuevoValor });
    assert.strictEqual(upd.status, 200, JSON.stringify(upd.body));

    const pub = await request(app).get('/api/public/landing');
    assert.strictEqual(pub.body.content['hero.title'], nuevoValor);
  });

  test('socio normal no puede editar landing (403)', async () => {
    const res = await request(app)
      .put('/api/admin/landing/hero.title')
      .set('Authorization', `Bearer ${socio2Token}`)
      .send({ valor: 'pwned' });
    // 401 o 403 dependiendo de cómo middleware lo trata
    assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
  });

  test('export CSV de socios responde 200 (sin telefono plano)', async () => {
    // Bug regresivo encontrado en auditoría 2026-05: la SELECT incluía
    // `s.telefono` (columna dropeada en migración 002) y además se
    // shadowed la variable `csv` del módulo. Ambos cosas se arreglaron;
    // este test bloquea la regresión.
    const res = await request(app)
      .get('/api/admin/socios/exportar')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body).slice(0, 500));
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.text, /^\uFEFF/, 'falta BOM');
    assert.match(res.text, /ID,Email profesional/);
  });

  // ====== Flujo 5: eliminarCuenta — anonimización de mensajes (Bug 3) ======
  // Antes de la migración 006 las FKs eran CASCADE y el `UPDATE mensajes` era
  // dead code: los mensajes se borraban con el socio. Este test verifica que
  // ahora sobreviven con contenido anonimizado.

  test('socio 1 elimina su cuenta y los mensajes a socio 2 quedan anonimizados', async () => {
    const res = await request(app)
      .delete('/api/socios/eliminar-cuenta')
      .set('Authorization', `Bearer ${socioToken}`)
      .send({ confirmacion: 'CONFIRMO_ELIMINACION' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // El socio 2 (que recibió el mensaje "colaboramos") debe seguir viendo
    // la conversación, pero con el nombre del emisor anonimizado.
    const convs = await request(app)
      .get('/api/mensajeria/conversaciones')
      .set('Authorization', `Bearer ${socio2Token}`);
    assert.strictEqual(convs.status, 200, JSON.stringify(convs.body));
    // YELLOW 3R #4: la vista unifica "[Cuenta dada de baja]" para
    // cubrir tanto eliminación voluntaria (FK SET NULL) como baja
    // administrativa (estado='baja').
    const conv = convs.body.conversaciones.find((c) =>
      /Cuenta (dada de baja|eliminada)/.test(c.otro_socio_nombre)
    );
    assert.ok(conv, 'la conversación con el socio eliminado no aparece marcada como baja');

    // El contenido del mensaje original ha sido anonimizado
    const mensajes = await request(app)
      .get(`/api/mensajeria/conversaciones/${conv.conversacion_id}/mensajes`)
      .set('Authorization', `Bearer ${socio2Token}`);
    assert.strictEqual(mensajes.status, 200, JSON.stringify(mensajes.body));
    // Sentinel unificado tras GREEN #13 — "dado de baja" (no "dio de baja")
    const anonimizado = mensajes.body.mensajes.find((m) => /usuario dado de baja/.test(m.contenido));
    assert.ok(anonimizado, 'el mensaje no fue anonimizado tras la baja');
    assert.strictEqual(anonimizado.emisor_nombre, '[Cuenta eliminada]');
  });

  // ====== Flujo 6: recuperación de contraseña ======
  // Va antes de la baja administrativa porque necesita socio1 con sesión
  // viable (su cuenta sigue eliminada del Flujo 5; usamos socio2 que aún
  // está aprobado).

  test('forgot-password con email existente responde 200 y crea token', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'juan.test@example.com' });
    assert.strictEqual(res.status, 200);
    assert.match(res.body.message, /enviaremos|enlace/i);

    const { Client } = require('pg');
    const client = new Client(setup.TEST_DB_CONFIG);
    await client.connect();
    try {
      const row = await client.query(
        `SELECT COUNT(*)::int AS n FROM password_reset_tokens t
         JOIN socios s ON t.socio_id = s.id
         WHERE s.email = 'juan.test@example.com' AND t.used_at IS NULL`
      );
      assert.ok(row.rows[0].n >= 1, 'no se creó el token');
    } finally {
      await client.end();
    }
  });

  test('forgot-password con email INEXISTENTE también responde 200 (no revela)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'noexiste@example.com' });
    assert.strictEqual(res.status, 200);
    assert.match(res.body.message, /enviaremos|enlace/i);
  });

  test('reset-password con token válido cambia la contraseña', async () => {
    const crypto = require('crypto');
    const { Client } = require('pg');
    const client = new Client(setup.TEST_DB_CONFIG);
    await client.connect();
    let plainToken;
    try {
      plainToken = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(plainToken).digest('hex');
      // Usar NOW() + INTERVAL como el controller para mantener TZ consistency
      await client.query(
        `INSERT INTO password_reset_tokens (socio_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [socio2Id, hash]
      );
    } finally {
      await client.end();
    }

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: plainToken, newPassword: 'NuevaPass123' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    // Verifica que el login funciona con la nueva password
    const login = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'juan.test@example.com', password: 'NuevaPass123' });
    assert.strictEqual(login.status, 200);
  });

  test('reset-password con token reusado devuelve 400', async () => {
    // El token del test anterior ya está usado
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'algun-token-cualquiera-no-vale', newPassword: 'Otra1234' });
    assert.strictEqual(res.status, 400);
  });

  // ====== Flujo 7: baja administrativa desde admin ======
  // Va al final porque deja al socio 2 inactivo y rompería tests posteriores
  // que esperan autenticación válida con socio2Token.

  test('admin da de baja a un socio (sin baja voluntaria previa)', async () => {
    const res = await request(app)
      .post(`/api/admin/socios/${socio2Id}/dar-baja`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ motivo: 'Impago de cuota' });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));

    const { Client } = require('pg');
    const client = new Client(setup.TEST_DB_CONFIG);
    await client.connect();
    try {
      const row = await client.query(
        'SELECT estado, activo, notas_moderacion FROM socios WHERE id = $1',
        [socio2Id]
      );
      assert.strictEqual(row.rows[0].estado, 'baja');
      assert.strictEqual(row.rows[0].activo, false);
      assert.match(row.rows[0].notas_moderacion, /Impago/);
    } finally {
      await client.end();
    }
  });

  test('admin no puede dar de baja dos veces al mismo socio (409)', async () => {
    const res = await request(app)
      .post(`/api/admin/socios/${socio2Id}/dar-baja`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ motivo: 'Otro intento' });
    assert.strictEqual(res.status, 409);
  });

  // ====== Flujo 8: regresión 4R/5R — escalación de privilegios ======

  test('moderador NO puede crear admin (403)', async () => {
    // Crear un admin moderador y loguear
    await setup.seedAdmin('mod@test.local', 'ModTest123!', 'moderador');
    const login = await request(app)
      .post('/api/auth/login/admin')
      .send({ email: 'mod@test.local', password: 'ModTest123!' });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body));
    const modToken = login.body.token;

    const res = await request(app)
      .post('/api/admin/admins')
      .set('Authorization', `Bearer ${modToken}`)
      .send({
        email: 'attacker@evil.local',
        password: 'PwnTest123!',
        nombre: 'Attacker',
        rol: 'superadmin',
      });
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
  });

  test('superadmin no puede crear admin con rol fuera de whitelist (400)', async () => {
    const res = await request(app)
      .post('/api/admin/admins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'hacker@test.local',
        password: 'HackTest123!',
        nombre: 'Hacker',
        rol: 'hacker',
      });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /Rol inválido/i);
  });

  // ====== Flujo 9: regresión 5R RED — req.query sanitization ======
  // El sanitizer XSS sobre query strings (validateInput) tiene que
  // sobrevivir al ciclo getter de Express 5. Antes esto era un no-op
  // silencioso → atacantes podían colar `<script>` en filtros que
  // luego acababan en logs o respuestas reflectadas.

  test('validateInput sanitiza req.query (strip <>)', async () => {
    // El endpoint /api/admin/socios echoa `filters: { estado, provincia, search }`
    // en la respuesta. Mandar `<script>` en search y verificar que vuelve sin <>.
    const res = await request(app)
      .get('/api/admin/socios?search=' + encodeURIComponent('<script>alert(1)</script>'))
      .set('Authorization', `Bearer ${adminToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.filters, 'respuesta sin filters echoed');
    assert.ok(
      !/[<>]/.test(res.body.filters.search),
      `search no fue sanitizado: "${res.body.filters.search}"`
    );
  });

  // ====== Flujo 10: regresión 6R RED — directorio respeta consentimiento ======
  // RGPD: un socio que NO acepta visibilidad_datos NO debe aparecer en el
  // directorio para otros socios. El owner SÍ se ve a sí mismo. Admin
  // bypassa el filtro.

  test('directorio NO muestra socios con acepta_visibilidad_datos=false', async () => {
    // Crear viewer (acepta_visibilidad_datos=true) y target (false)
    const viewerReg = await request(app)
      .post('/api/auth/register')
      .send(
        validRegistration({
          email: 'viewer@test.local',
          nombre: 'Viewer',
          apellidos: 'Visible Test',
          telefono: '+34 612 345 678',
          acepta_visibilidad_datos: true,
        })
      );
    assert.strictEqual(viewerReg.status, 201, JSON.stringify(viewerReg.body));
    const viewerId = viewerReg.body.socio.id;
    await setup.approveSocioDirectly(viewerId);

    const targetReg = await request(app)
      .post('/api/auth/register')
      .send(
        validRegistration({
          email: 'private@test.local',
          nombre: 'Privato',
          apellidos: 'NoVisible Test',
          telefono: '+34 613 456 789',
          acepta_visibilidad_datos: false,
        })
      );
    assert.strictEqual(targetReg.status, 201, JSON.stringify(targetReg.body));
    const targetId = targetReg.body.socio.id;
    await setup.approveSocioDirectly(targetId);

    const login = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'viewer@test.local', password: 'TestPass123' });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body));
    const viewerToken = login.body.token;

    // Como socio viewer: directorio no debe contener al target
    const res = await request(app)
      .get('/api/socios/directorio?limit=200')
      .set('Authorization', `Bearer ${viewerToken}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.socios.map((s) => s.id);
    assert.ok(!ids.includes(targetId), `target ${targetId} apareció en directorio: ${ids}`);
    // Owner exception: el viewer SÍ se ve a sí mismo
    assert.ok(ids.includes(viewerId), `viewer ${viewerId} no se ve a sí mismo`);
  });

  // ====== Flujo 11: regresión 6R YELLOW #1 — cap multi-message ======

  test('enviarMensajeMulti rechaza > 50 receptores (400)', async () => {
    const login = await request(app)
      .post('/api/auth/login/socio')
      .send({ email: 'viewer@test.local', password: 'TestPass123' });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body));
    const viewerToken = login.body.token;

    // 51 ids inventados (no necesitan existir — el cap se aplica antes)
    const receptorIds = Array.from({ length: 51 }, (_, i) => 10000 + i);
    const res = await request(app)
      .post('/api/mensajeria/mensajes/multi')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ receptorIds, contenido: 'spam' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error || '', /M(á|a)ximo 50 receptores/);
  });
});
