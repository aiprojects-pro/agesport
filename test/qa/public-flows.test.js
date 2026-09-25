const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const setup = require('../integration/_setup');
setup.setTestEnv();
process.env.PUBLIC_BASE_URL = 'https://qa.example.invalid';
const db = require('../../config/database');
const email = require('../../services/emailService');
const geocode = require('../../services/geocodingService');
const mails = [];
let server, base, adminToken, socioId, socioToken;
const password = 'RegistroLocal123!';
const registration = {
  email: 'alta@example.invalid', password, nombre: 'Alta', apellidos: 'Prueba',
  provincia: 'Sevilla', localidad: 'Sevilla', cargo_actual: 'Gestora', anos_experiencia: 12,
  acepta_mapa_interactivo: true, acepta_visibilidad_datos: true,
  acepta_mensajeria: true, acepta_notificaciones_email: true,
};
async function call(path, body, token, method = 'POST') {
  const res = await fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json() };
}
async function waitMail(start, to) {
  for (let i = 0; i < 100; i++) {
    const mail = mails.slice(start).find(m => m.to === to);
    if (mail) return mail;
    await new Promise(r => setTimeout(r, 20));
  }
  assert.fail('No se generó el correo esperado');
}
before(async () => {
  await setup.resetTestDb();
  await setup.seedAdmin('admin@example.invalid', password);
  // No proveedor externo: verificar el flujo y contenido, no entrega SMTP real.
  geocode.geocode = async () => null;
  email.transporter = { async sendMail(mail) { mails.push(mail); return { messageId: 'qa-local' }; } };
  server = setup.getTestApp().listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(r => server.close(r)); await db.close(); });

test('public registration validates input, persists a pending account and blocks duplicates', async () => {
  assert.equal((await call('/api/auth/register', { ...registration, email: 'incorrecto' })).status, 400);
  assert.equal((await call('/api/auth/register', { ...registration, password: 'abcdefgh' })).status, 400);
  const res = await call('/api/auth/register', registration);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.socio.estado, 'pendiente'); socioId = res.body.socio.id;
  const adminNotice = mails.find(m => m.to === 'admin@example.invalid');
  assert.ok(adminNotice.html.includes('https://qa.example.invalid/acceso-admin.html'));
  assert.equal((await call('/api/auth/register', registration)).status, 400);
  assert.equal((await call('/api/auth/login/socio', { email: registration.email, password })).status, 403);
});
test('approval sends a confirmation and enables the chosen password', async () => {
  const login = await call('/api/auth/login/admin', { email: 'admin@example.invalid', password });
  assert.equal(login.status, 200); adminToken = login.body.token;
  const start = mails.length;
  const approval = await call(`/api/admin/socios/${socioId}/aprobar`, {}, adminToken);
  assert.equal(approval.status, 200, JSON.stringify(approval.body));
  const mail = await waitMail(start, registration.email);
  assert.ok(mail.html.includes('/acceso.html'));
  const socio = await call('/api/auth/login/socio', { email: registration.email, password });
  assert.equal(socio.status, 200); socioToken = socio.body.token;
});
test('message email follows opt-in; disabling it still delivers the internal message', async () => {
  const r = await call('/api/auth/register', { ...registration, email: 'emisor@example.invalid', nombre: 'Emisor' });
  assert.equal(r.status, 201);
  await call(`/api/admin/socios/${r.body.socio.id}/aprobar`, {}, adminToken);
  const sender = await call('/api/auth/login/socio', { email: 'emisor@example.invalid', password });
  let start = mails.length;
  const sent = await call('/api/mensajeria/mensajes', { receptorId: socioId, contenido: 'Prueba de notificación' }, sender.body.token);
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  const mail = await waitMail(start, registration.email);
  assert.ok(mail.html.includes('https://qa.example.invalid/mensajes.html'));
  assert.ok(mail.html.includes('Prueba de notificación'));
  await db.query('UPDATE consentimientos SET acepta_notificaciones_email=false WHERE socio_id=$1', [socioId]);
  start = mails.length;
  assert.equal((await call('/api/mensajeria/mensajes', { receptorId: socioId, contenido: 'Sin aviso por correo' }, sender.body.token)).status, 201);
  assert.equal(mails.length, start);
  const persisted = await db.query('SELECT contenido FROM mensajes WHERE receptor_id=$1', [socioId]);
  assert.equal(persisted.rows.length, 2);
});
for (const type of ['socio', 'admin']) {
  test(`${type}: recovery email, expired link, single-use token and new login`, async () => {
    const prefix = type === 'admin' ? '/api/auth/admin' : '/api/auth';
    const recipient = type === 'admin' ? 'admin@example.invalid' : registration.email;
    const table = type === 'admin' ? 'admin_password_reset_tokens' : 'password_reset_tokens';
    const idCol = type === 'admin' ? 'admin_id' : 'socio_id';
    const start = mails.length;
    const known = await call(`${prefix}/forgot-password`, { email: recipient });
    const unknown = await call(`${prefix}/forgot-password`, { email: 'no-existe@example.invalid' });
    assert.deepEqual(known, unknown);
    const mail = await waitMail(start, recipient);
    const url = mail.html.match(/https:\/\/qa\.example\.invalid\/restablecer\.html[^"\s<]+/)[0].replace(/&amp;/g, '&');
    const parsed = new URL(url);
    const token = parsed.searchParams.get('token');
    assert.equal(parsed.searchParams.get('type'), type === 'admin' ? 'admin' : null);
    assert.match(token, /^[a-f0-9]{64}$/);
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = (await db.query(`SELECT * FROM ${table} WHERE token_hash=$1`, [hash])).rows[0];
    assert.ok(row);
    const expired = crypto.randomBytes(32).toString('hex');
    await db.query(`INSERT INTO ${table} (${idCol},token_hash,expires_at) VALUES ($1,$2,NOW()-INTERVAL '1 minute')`, [row[idCol], crypto.createHash('sha256').update(expired).digest('hex')]);
    assert.equal((await call(`${prefix}/reset-password`, { token: expired, newPassword: 'NuevaLocal456!' })).status, 400);
    assert.equal((await call(`${prefix}/reset-password`, { token, newPassword: 'abcdefgh' })).status, 400);
    assert.equal((await call(`${prefix}/reset-password`, { token, newPassword: 'NuevaLocal456!' })).status, 200);
    assert.equal((await call(`${prefix}/reset-password`, { token, newPassword: 'OtraLocal789!' })).status, 400);
    assert.equal((await call(`/api/auth/login/${type}`, { email: recipient, password })).status, 401);
    assert.equal((await call(`/api/auth/login/${type}`, { email: recipient, password: 'NuevaLocal456!' })).status, 200);
  });
}

test('reset page loads its behavior through a script allowed by the security policy', async () => {
  const res = await fetch(base + '/restablecer.html');
  const html = await res.text();
  assert.ok(!/<script>/.test(html), 'inline script would be blocked');
  assert.ok(res.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.ok(html.includes('src="/assets/reset-password.js"'));
  const script = await fetch(base + '/assets/reset-password.js');
  assert.equal(script.status, 200);
  assert.match(await script.text(), /Falta el token/);
});
