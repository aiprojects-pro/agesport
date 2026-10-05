const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../integration/_setup');
setup.setTestEnv();
const db = require('../../config/database');
const bcrypt = require('bcryptjs');
const email = require('../../services/emailService');
let server, base, root, delegate, other, member, delegateId, otherId, firstId, secondId;
let sent = [];
const password = 'Delegate2026!';
async function call(path, token, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}
before(async () => {
  await setup.resetTestDb();
  await setup.seedAdmin('root@example.invalid', password);
  const hash = await bcrypt.hash(password, 4);
  for (const [n, province] of [
    ['delegate', 'Sevilla'],
    ['other', 'Málaga'],
  ]) {
    const row = (
      await db.query(
        "INSERT INTO administradores(email,password_hash,nombre,rol,provincia_delegacion) VALUES($1,$2,$3,'delegado_provincial',$4) RETURNING id",
        [n + '@example.invalid', hash, n, province]
      )
    ).rows[0];
    if (n === 'delegate') delegateId = row.id;
    else otherId = row.id;
  }
  for (let i = 0; i < 4; i++) {
    const id = (
      await db.query(
        "INSERT INTO socios(email,password_hash,nombre,apellidos,provincia,localidad,estado,activo,tipo_socio) VALUES($1,$2,$3,'Ejemplo',$4,$4,'aprobado',true,'numero') RETURNING id",
        ['member' + i + '@example.invalid', hash, 'Persona ' + i, i === 3 ? 'Málaga' : 'Sevilla']
      )
    ).rows[0].id;
    await db.query(
      'INSERT INTO consentimientos(socio_id,acepta_mensajeria,acepta_notificaciones_email) VALUES($1,true,$2)',
      [id, i !== 2]
    );
    if (i === 0) firstId = id;
    if (i === 1) secondId = id;
  }
  await email.ready;
  email.transporter = {
    sendMail: async (m) => {
      sent.push(m);
      return { accepted: [m.to], rejected: [], messageId: 'fake' };
    },
  };
  server = setup.getTestApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
  root = (await call('/api/auth/login/admin', null, { email: 'root@example.invalid', password }))
    .body.token;
  delegate = (
    await call('/api/auth/login/admin', null, { email: 'delegate@example.invalid', password })
  ).body.token;
  other = (await call('/api/auth/login/admin', null, { email: 'other@example.invalid', password }))
    .body.token;
  member = (
    await call('/api/auth/login/socio', null, { email: 'member0@example.invalid', password })
  ).body.token;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
});
async function completed(id) {
  for (let i = 0; i < 100; i++) {
    const c = (await db.query('SELECT * FROM comunicaciones WHERE id=$1', [id])).rows[0];
    if (['completada', 'con_errores'].includes(c.estado)) return c;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('Campaign did not complete');
}
test('delegate session and lists are scoped from database; forged province and other roles rejected', async () => {
  const session = await call('/api/auth/verify', delegate);
  assert.equal(session.body.user.rol, 'delegado_provincial');
  assert.equal(session.body.user.provincia_delegacion, 'Sevilla');
  const r = await call('/api/delegacion/socios', delegate);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 3);
  assert.ok(r.body.socios.every((s) => s.provincia === 'Sevilla'));
  assert.equal(r.body.socios[0].email, undefined);
  assert.equal(r.body.socios[0].dni_nie, undefined);
  assert.equal((await call('/api/delegacion/socios?search=Persona%200', delegate)).body.total, 1);
  assert.equal((await call('/api/delegacion/socios?provincia=Málaga', delegate)).status, 403);
  assert.equal((await call('/api/delegacion/socios?admin_id=1', delegate)).status, 400);
  assert.equal((await call('/api/delegacion/socios', member)).status, 403);
  assert.equal((await call('/api/delegacion/socios', root)).status, 403);
});
test('delegate cannot use global admin or member/profile routes to bypass scope', async () => {
  for (const path of [
    '/api/admin/socios',
    '/api/admin/configuracion',
    '/api/admin/administradores',
    '/api/admin/mapa',
    '/api/admin/privacidad',
    '/api/admin/comunicaciones',
    '/api/socios/perfil/' + firstId,
  ]) {
    assert.equal((await call(path, delegate)).status, 403, path);
  }
  assert.equal(
    (
      await call('/api/admin/comunicaciones/enviar', delegate, {
        asunto: 'No permitido',
        cuerpo: 'No se puede enviar',
        filtros: {},
      })
    ).status,
    403
  );
  assert.equal(
    (
      await call('/api/admin/administradores', delegate, {
        email: 'bad@example.invalid',
        nombre: 'Bad',
        password,
        rol: 'superadmin',
      })
    ).status,
    403
  );
});
test('only superadmin can assign delegate scope; last superadmin remains protected', async () => {
  let r = await call('/api/admin/administradores', root, {
    email: 'new@example.invalid',
    nombre: 'Nuevo',
    password,
    rol: 'delegado_provincial',
  });
  assert.equal(r.status, 400);
  r = await call('/api/admin/administradores', root, {
    email: 'new@example.invalid',
    nombre: 'Nuevo',
    password,
    rol: 'delegado_provincial',
    provincia_delegacion: 'sevilla',
  });
  assert.equal(r.status, 201);
  const adminId = (await call('/api/auth/verify', root)).body.user.id;
  assert.equal(
    (
      await call(
        '/api/admin/administradores/' + adminId,
        root,
        { rol: 'delegado_provincial', provincia_delegacion: 'Sevilla' },
        'PUT'
      )
    ).status,
    400
  );
  const admins = await call('/api/admin/administradores', root);
  assert.equal(
    admins.body.administradores.find((a) => a.id === r.body.administrador.id).provincia_delegacion,
    'Sevilla'
  );
});
test('campaign preview and send enforce scope and preferences; histories cannot cross delegates', async () => {
  assert.equal(
    (await call('/api/delegacion/comunicaciones/preview', delegate, {})).body.destinatarios,
    2
  );
  assert.equal(
    (await call('/api/delegacion/comunicaciones/preview', delegate, { search: 'Persona 0' })).body
      .destinatarios,
    1
  );
  assert.equal(
    (await call('/api/delegacion/comunicaciones/preview', delegate, { provincia: 'Málaga' }))
      .status,
    403
  );
  assert.equal(
    (
      await call('/api/delegacion/comunicaciones/enviar', delegate, {
        asunto: 'Otra provincia',
        cuerpo: 'Mensaje de prueba',
        filtros: { provincia: 'Málaga' },
      })
    ).status,
    403
  );
  const r = await call('/api/delegacion/comunicaciones/enviar', delegate, {
    asunto: 'Prueba provincial',
    cuerpo: 'Hola {nombre}, prueba informativa.',
    filtros: {},
  });
  assert.equal(r.body.destinatarios, 2);
  await completed(r.body.comunicacion_id);
  assert.deepEqual(sent.map((m) => m.to).sort(), [
    'member0@example.invalid',
    'member1@example.invalid',
  ]);
  assert.ok(sent.every((m) => m.html.includes('data-agesport-legal-notice')));
  assert.equal(
    (await call('/api/delegacion/comunicaciones', delegate)).body.comunicaciones.length,
    1
  );
  assert.equal(
    (await call('/api/delegacion/comunicaciones?admin_id=' + delegateId, other)).body.comunicaciones
      .length,
    0
  );
  assert.equal(
    (await call('/api/admin/comunicaciones/' + r.body.comunicacion_id + '/destinatarios', delegate))
      .status,
    403
  );
});
test('queued delivery rechecks assignment; reassignment and deactivation affect existing sessions immediately', async () => {
  sent = [];
  email.transporter = {
    sendMail: async (m) => {
      sent.push(m);
      await db.query("UPDATE administradores SET provincia_delegacion='Málaga' WHERE id=$1", [
        delegateId,
      ]);
      return { accepted: [m.to], rejected: [], messageId: 'fake' };
    },
  };
  const r = await call('/api/delegacion/comunicaciones/enviar', delegate, {
    asunto: 'Cambio de ámbito',
    cuerpo: 'Prueba de cambio durante envío.',
    filtros: {},
  });
  const c = await completed(r.body.comunicacion_id);
  assert.equal(sent.length, 1);
  assert.equal(c.fallidos, 1);
  assert.equal((await call('/api/delegacion/socios', delegate)).body.total, 1);
  assert.equal(
    (await call('/api/delegacion/comunicaciones', delegate)).body.comunicaciones.length,
    0
  );
  await db.query('UPDATE administradores SET activo=false WHERE id=$1', [delegateId]);
  assert.equal((await call('/api/delegacion/socios', delegate)).status, 401);
});
