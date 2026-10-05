const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../integration/_setup');
setup.setTestEnv();
process.env.PUBLIC_BASE_URL = 'https://qa.example.invalid';
const db = require('../../config/database');
const email = require('../../services/emailService');
const geo = require('../../services/geocodingService');
const cat = require('../../config/catalogos');
let server,
  base,
  admin,
  member,
  id,
  version = 1;
const sent = [];
const password = 'Octubre.2026<>!';
const reg = {
  email: 'october@example.invalid',
  password,
  nombre: 'Octubre',
  apellidos: 'Prueba',
  provincia: 'Ceuta',
  localidad: 'Ceuta',
  cargo_actual: 'Gestora',
  anos_experiencia: 9,
  rol_cluster: cat.ROLES_CLUSTER[0].slug,
  rol_secundario: cat.ROLES_CLUSTER[1].slug,
  especialidades: [cat.ESPECIALIDADES[0].slug],
  acepta_mapa_interactivo: true,
  acepta_visibilidad_datos: true,
  acepta_mensajeria: true,
  acepta_notificaciones_email: true,
  policy_version_id: 1,
};
async function call(url, body, token = admin, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const t = await r.text();
  let b;
  try {
    b = JSON.parse(t);
  } catch {
    b = t;
  }
  return { status: r.status, body: b };
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.fail('timeout');
}
before(async () => {
  await setup.resetTestDb();
  await setup.seedAdmin('admin@example.invalid', 'Admin.2026!');
  geo.geocode = async () => null;
  await email.ready;
  email.transporter = {
    async sendMail(m) {
      sent.push(m);
      return { accepted: [m.to], messageId: 'local-test' };
    },
  };
  server = setup.getTestApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  admin = (
    await call(
      '/api/auth/login/admin',
      { email: 'admin@example.invalid', password: 'Admin.2026!' },
      null
    )
  ).body.token;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
});

test('dot and literal angle brackets accepted unchanged; pending account blocked; approval preserves password', async () => {
  const r = await call('/api/auth/register', reg, null);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  id = r.body.socio.id;
  assert.equal(
    (await call('/api/auth/login/socio', { email: reg.email, password }, null)).status,
    403
  );
  assert.equal((await call('/api/admin/socios/' + id + '/aprobar', {})).status, 200);
  const login = await call('/api/auth/login/socio', { email: reg.email, password }, null);
  assert.equal(login.status, 200);
  member = login.body.token;
  assert.equal(
    (
      await call(
        '/api/auth/login/socio',
        { email: reg.email, password: password.replace(/[<>]/g, '') },
        null
      )
    ).status,
    401
  );
  const events = await call('/api/admin/privacidad/respuestas/' + id);
  assert.equal(events.body.responses.length, 4);
  assert.ok(events.body.responses.every((e) => e.version_id === 1));
  const own = await call('/api/socios/perfil/' + id, null, member);
  assert.equal(own.body.socio.rol_secundario, reg.rol_secundario);
  assert.deepEqual(own.body.socio.especialidades, reg.especialidades);
});
test('draft is private, publish explicit and optimistic, prior versions and responses survive, preferences unchanged', async () => {
  const before = (await db.query('SELECT * FROM consentimientos WHERE socio_id=$1', [id])).rows[0];
  assert.equal((await call('/api/admin/privacidad', null, member)).status, 403);
  const draft = await call(
    '/api/admin/privacidad/borrador',
    {
      revision: 0,
      title: 'Texto de prueba local',
      content:
        '# Título local\nPárrafo de prueba, no es texto jurídico.\n- Elemento\n[Enlace](https://example.invalid)\n<script>alert(1)</script>\n[No](javascript:alert(1))',
    },
    admin,
    'PUT'
  );
  assert.equal(draft.status, 200);
  assert.equal((await call('/api/public/privacidad', null, null)).body.id, 1);
  assert.equal(
    (
      await call(
        '/api/admin/privacidad/borrador',
        { revision: 0, title: 'Conflicto', content: 'No sobrescribir otro borrador.' },
        admin,
        'PUT'
      )
    ).status,
    409
  );
  assert.equal((await call('/api/admin/privacidad/publicar', { revision: 1 })).status, 400);
  assert.equal(
    (await call('/api/admin/privacidad/publicar', { revision: 0, confirm: true })).status,
    409
  );
  const publish = await call('/api/admin/privacidad/publicar', { revision: 1, confirm: true });
  assert.equal(publish.status, 200);
  version = publish.body.version.id;
  assert.equal(
    (await call('/api/admin/privacidad/publicar', { revision: 1, confirm: true })).status,
    409
  );
  const page = await call('/privacidad.html', null, null);
  assert.match(page.body, /<h2>Título local/);
  assert.match(page.body, /<li>Elemento/);
  assert.ok(!page.body.includes('<script>alert'));
  assert.ok(!page.body.includes('href="javascript:'));
  const old = await call('/privacidad.html?version=1', null, null);
  assert.match(old.body, /Responsable del tratamiento/);
  assert.ok(!old.body.includes('Título local'));
  assert.deepEqual(
    (await db.query('SELECT * FROM consentimientos WHERE socio_id=$1', [id])).rows[0],
    before
  );
  const stale = await call(
    '/api/socios/perfil',
    { nombre: 'NoGuardar', acepta_mensajeria: false, policy_version_id: 1 },
    member,
    'PUT'
  );
  assert.equal(stale.status, 409);
  assert.equal(
    (await db.query('SELECT nombre FROM socios WHERE id=$1', [id])).rows[0].nombre,
    'Octubre'
  );
  assert.equal(
    (
      await call(
        '/api/socios/perfil',
        { acepta_mensajeria: false, policy_version_id: version },
        member,
        'PUT'
      )
    ).status,
    200
  );
  const history = await call('/api/admin/privacidad/respuestas/' + id);
  assert.equal(history.body.responses.length, 5);
  assert.equal(history.body.responses[0].version_id, version);
  assert.equal(history.body.responses[0].answer, false);
  assert.equal(
    (
      await call(
        '/api/socios/perfil',
        { acepta_mensajeria: true, policy_version_id: version },
        member,
        'PUT'
      )
    ).status,
    200
  );
  const exp = await call('/api/socios/mis-datos/exportar', null, member);
  assert.equal(exp.body.respuestas_privacidad.length, 6);
  assert.ok(!exp.body.datos_personales.password_hash);
});
test('company and sponsorship links remain independent of account access and each other', async () => {
  const c = await call('/api/admin/vinculos/empresas', {
    nombre: 'Empresa local',
    referencia: 'test',
  });
  assert.equal(c.status, 200);
  const other = await call('/api/admin/vinculos/empresas', { nombre: 'Otra empresa' });
  const p = await call('/api/admin/vinculos/patrocinios', {
    empresa_id: c.body.id,
    modalidad: 'Modalidad pendiente',
    inicio: '2026-01-01',
    fin: '2026-12-31',
    cupo_propuesto: 4,
    condiciones_propuestas: 'Borrador pendiente de aprobación',
  });
  assert.equal(p.status, 200);
  assert.equal(p.body.inicio, "2026-01-01");
  assert.equal(p.body.fin, "2026-12-31");
  const body = {
    socio_id: id,
    empresa_id: c.body.id,
    patrocinio_id: p.body.id,
    motivo: 'Representante de empresa; no concede acceso',
    inicio: '2026-01-01',
  };
  assert.equal(
    (await call('/api/admin/vinculos/personas', { ...body, empresa_id: other.body.id })).status,
    400
  );
  assert.equal((await call('/api/admin/vinculos/personas', body, member)).status, 403);
  const a = await call('/api/admin/vinculos/personas', body);
  assert.equal(a.status, 201);
  const b = await call('/api/admin/vinculos/personas', {
    ...body,
    patrocinio_id: null,
    motivo: 'Vínculo profesional independiente',
  });
  assert.equal(b.status, 201);
  assert.equal(
    (
      await call(
        '/api/admin/vinculos/personas/' + a.body.id + '/fin',
        { fin: '2026-01-31' },
        admin,
        'PUT'
      )
    ).status,
    200
  );
  const listing = await call('/api/admin/vinculos');
  assert.equal(listing.body.derechos_automaticos, false);
  assert.equal(listing.body.vinculos.find((v) => v.id === b.body.id).fin, null);
  assert.equal(listing.body.patrocinios[0].configuracion_futura.estado, 'pendiente_aprobacion');
  assert.equal(listing.body.historial.length, 6);
  assert.equal((await call('/api/socios/mapa', null, member)).status, 200);
  assert.equal(
    (await db.query('SELECT estado FROM socios WHERE id=$1', [id])).rows[0].estado,
    'aprobado'
  );
});
test('Ceuta and Melilla have provincial fallback; separate secondary roles and visibility; selected email stays independent', async () => {
  assert.equal(
    (
      await call(
        '/api/socios/perfil',
        {
          email_profesional: 'work@example.invalid',
          email_personal: 'personal@example.invalid',
          email_preferido: 'personal',
          email_visible: 'personal',
          visible_email_directo: false,
        },
        member,
        'PUT'
      )
    ).status,
    200
  );
  assert.equal(
    (await call('/api/socios/perfil', { email_personal: null }, member, 'PUT')).status,
    400
  );
  let mapa = await call('/api/socios/mapa', null, member);
  let point = mapa.body.socios.find((x) => x.id === id);
  assert.ok(point);
  assert.equal(point.provincia, 'Ceuta');
  assert.ok(point.lat > 35 && point.lat < 36);
  assert.equal(
    (
      await call(
        '/api/socios/perfil',
        { provincia: 'Melilla', localidad: 'Melilla' },
        member,
        'PUT'
      )
    ).status,
    200
  );
  mapa = await call('/api/socios/mapa', null, member);
  point = mapa.body.socios.find((x) => x.id === id);
  assert.equal(point.provincia, 'Melilla');
  assert.ok(point.lat > 35 && point.lat < 35.5);
  await call('/api/socios/perfil', { acepta_mapa_interactivo: false }, member, 'PUT');
  assert.ok(!(await call('/api/socios/mapa', null, member)).body.socios.some((x) => x.id === id));
  await call('/api/socios/perfil', { acepta_mapa_interactivo: true }, member, 'PUT');
  assert.equal(
    (await call('/api/auth/login/socio', { email: reg.email, password }, null)).status,
    200
  );
  assert.equal(
    (await call('/api/auth/login/socio', { email: 'personal@example.invalid', password }, null))
      .status,
    401
  );
});
test('segmentation respects email opt-out; no commercial category; sends individually to selected address with history', async () => {
  const filter = { provincia: 'Melilla', rol_cluster: reg.rol_secundario };
  assert.equal((await call('/api/admin/comunicaciones/preview', {provincia_desconocida:'Melilla'})).status,400);
  assert.equal((await call('/api/admin/comunicaciones/preview', filter)).body.destinatarios, 1);
  await call('/api/socios/perfil', { acepta_notificaciones_email: false }, member, 'PUT');
  assert.equal((await call('/api/admin/comunicaciones/preview', filter)).body.destinatarios, 0);
  assert.equal(
    (
      await call('/api/admin/comunicaciones/enviar', {
        tipo_comunicacion: 'comercial',
        asunto: 'Anuncio',
        cuerpo: 'Comercial no autorizado',
      })
    ).status,
    400
  );
  await call('/api/socios/perfil', { acepta_notificaciones_email: true }, member, 'PUT');
  const start = sent.length;
  const c = await call('/api/admin/comunicaciones/enviar', {
    asunto: 'Prueba informativa',
    cuerpo: 'Mensaje de prueba de funcionamiento.',
    filtros: filter,
  });
  assert.equal(c.body.destinatarios, 1);
  await waitFor(
    async () =>
      (await db.query('SELECT estado FROM comunicaciones WHERE id=$1', [c.body.comunicacion_id]))
        .rows[0].estado === 'completada'
  );
  assert.equal(sent.slice(start).length, 1);
  assert.equal(sent[start].to, 'personal@example.invalid');
  assert.ok(!sent[start].cc && !sent[start].bcc);
  const history = await call(
    '/api/admin/comunicaciones/' + c.body.comunicacion_id + '/destinatarios'
  );
  assert.equal(history.body.destinatarios[0].estado, 'aceptado');
});
test('suspension rejects open sessions and reactivation preserves choices; baja separate from suspension', async () => {
  const before = (await db.query('SELECT * FROM consentimientos WHERE socio_id=$1', [id])).rows[0];
  assert.equal(
    (await call('/api/admin/socios/' + id + '/suspender', { motivo: 'Prueba local' })).status,
    200
  );
  assert.equal((await call('/api/socios/mapa', null, member)).status, 401);
  assert.equal((await call('/api/admin/socios/' + id + '/reactivar', {})).status, 200);
  assert.deepEqual(
    (await db.query('SELECT * FROM consentimientos WHERE socio_id=$1', [id])).rows[0],
    before
  );
  assert.equal((await call('/api/socios/mapa', null, member)).status, 200);
  assert.equal(
    (await call('/api/socios/solicitar-baja', { motivo: 'Prueba local' }, member)).status,
    201
  );
  assert.equal(
    (await call('/api/admin/socios/accesos')).body.socios.find((x) => x.id === id).baja_solicitada,
    true
  );
  const bajas = await call('/api/admin/bajas');
  const bid = bajas.body.bajas.find((x) => x.socio_id === id).id;
  assert.equal(
    (await call('/api/admin/bajas/' + bid + '/gestionar', { accion: 'aprobar' })).status,
    200
  );
  assert.equal(
    (await db.query('SELECT estado FROM socios WHERE id=$1', [id])).rows[0].estado,
    'baja'
  );
  assert.equal((await call('/api/socios/mapa', null, member)).status, 401);
});
