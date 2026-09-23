const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../integration/_setup');
setup.setTestEnv();
const db = require('../../config/database');
const socios = require('../../controllers/sociosController');
const admin = require('../../controllers/adminController');

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

after(() => db.close());

test('imported account preferences persist without granting unrelated visibility', async () => {
  await setup.resetTestDb();
  const inserted = await db.query(`INSERT INTO socios
    (email, password_hash, nombre, apellidos, provincia, localidad, estado)
    VALUES ('qa@example.invalid', 'unused', 'QA', 'Import', 'Sevilla', 'Sevilla', 'aprobado') RETURNING id`);
  const socioId = inserted.rows[0].id;
  const req = { socioId, body: { acepta_mensajeria: true, acepta_notificaciones_email: true },
    headers: {}, ip: '127.0.0.1', get: () => 'qa' };
  const res = response();
  await socios.updatePerfil(req, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  let saved = await db.findOne('consentimientos', { socio_id: socioId });
  assert.equal(saved.acepta_mensajeria, true);
  assert.equal(saved.acepta_notificaciones_email, true);
  assert.equal(saved.acepta_mapa_interactivo, false);
  assert.equal(saved.acepta_visibilidad_datos, false);
  assert.equal(saved.visible_email_directo, false);

  // Updating one preference must preserve the others and the single row.
  req.body = { acepta_mensajeria: false };
  await socios.updatePerfil(req, response());
  saved = await db.findOne('consentimientos', { socio_id: socioId });
  assert.equal(saved.acepta_mensajeria, false);
  assert.equal(saved.acepta_notificaciones_email, true);
  const count = await db.query('SELECT count(*) FROM consentimientos WHERE socio_id=$1', [socioId]);
  assert.equal(Number(count.rows[0].count), 1);
});

test('legacy pending invitation with malformed email cannot be approved', async () => {
  const invitation = await db.insert('accesos_invitados', {
    email: 'correo-no-valido', nombre: 'QA', estado: 'pendiente'
  });
  const res = response();
  await admin.aprobarAccesoInvitado({ params: { invitadoId: invitation.id } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Email no válido/);
  assert.equal(await db.findOne('socios', { email: 'correo-no-valido' }), null);
});

test('admin dashboard returns province and specialty arrays for the admin UI', async () => {
  const res = response();
  await admin.getEstadisticasAdmin({}, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(res.body.provincias_mas_activas.some(p => p.provincia === 'Sevilla'));
  assert.ok(Array.isArray(res.body.top_especialidades));
});

test('successful role switch clears the previous role cookie; failed login does not', async () => {
  const auth = require('../../controllers/authController');
  const credentials = await setup.seedAdmin();
  const req = { body: credentials, headers: {}, ip: '127.0.0.1', get: () => 'qa' };
  const cleared = [];
  const res = response();
  res.cookie = () => res;
  res.clearCookie = name => { cleared.push(name); return res; };
  await auth.loginAdmin(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(cleared, ['token', 'refreshToken']);
  cleared.length = 0;
  req.body = { ...credentials, password: 'wrong' };
  await auth.loginAdmin(req, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(cleared, []);
});
