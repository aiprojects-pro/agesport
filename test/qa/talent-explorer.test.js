const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../integration/_setup');
setup.setTestEnv();
const db = require('../../config/database');
const bcrypt = require('bcryptjs');
let server, base, token, id, hidden;
before(async () => {
  await setup.resetTestDb();
  const hash = await bcrypt.hash('MapTest.2026!', 4);
  for (const [i, visible, prov] of [
    [0, true, 'Sevilla'],
    [1, true, 'Sevilla'],
    [2, true, 'Ubicación antigua'],
    [3, false, 'Sevilla'],
  ]) {
    const row = (
      await db.query(
        "INSERT INTO socios(email,password_hash,nombre,apellidos,provincia,localidad,estado,activo) VALUES($1,$2,$3,'Mapa',$4,'Centro','aprobado',true) RETURNING id",
        ['explorer' + i + '@example.invalid', hash, 'Socio ' + i, prov]
      )
    ).rows[0];
    await db.query(
      'INSERT INTO consentimientos(socio_id,mapa_visible,acepta_mapa_interactivo,acepta_visibilidad_datos,acepta_mensajeria) VALUES($1,$2,$2,false,false)',
      [row.id, visible]
    );
    if (i === 0) {
      id = row.id;
      await db.query(
        "INSERT INTO disponibilidad(socio_id,nivel,tutor_mentor,ponente) VALUES($1,'Alta',true,true)",
        [id]
      );
    }
    if (i === 3) hidden = row.id;
  }
  server = setup.getTestApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  const r = await fetch(base + '/api/auth/login/socio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'explorer0@example.invalid', password: 'MapTest.2026!' }),
  });
  token = (await r.json()).token;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
});
async function mapa() {
  const r = await fetch(base + '/api/socios/mapa', {
    headers: { Authorization: 'Bearer ' + token },
  });
  return { r, data: await r.json() };
}
test('all eligible profiles returned, including one without coordinates; privacy and contact flags retained', async () => {
  const { r, data } = await mapa();
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.ok(data.actualizado);
  assert.equal(data.total_elegibles, 3);
  assert.equal(data.socios.length, 3);
  assert.equal(data.sin_ubicacion, 1);
  assert.ok(!data.socios.some((s) => s.id === hidden));
  const noLocation = data.socios.find((s) => s.provincia === 'Ubicación antigua');
  assert.equal(noLocation.lat, null);
  assert.equal(noLocation.lng, null);
  assert.equal(noLocation.precision, 'pendiente');
  const member = data.socios.find((s) => s.id === id);
  assert.equal(member.tutor_mentor, true);
  assert.equal(member.ponente, true);
  const other = data.socios.find((s) => s.id !== id && s !== noLocation);
  assert.equal(other.perfil_visible, false);
  assert.equal(other.mensajeria, false);
  assert.equal(other.email, undefined);
});
test('subsequent reads reflect preference changes and status changes immediately', async () => {
  await db.query('UPDATE consentimientos SET mapa_visible=false WHERE socio_id=$1', [id]);
  assert.equal((await mapa()).data.socios.length, 2);
  await db.query('UPDATE consentimientos SET mapa_visible=true WHERE socio_id=$1', [id]);
  assert.equal((await mapa()).data.socios.length, 3);
  await db.query("UPDATE socios SET estado='suspendido' WHERE id=$1", [id]);
  assert.equal((await mapa()).r.status, 401);
});
