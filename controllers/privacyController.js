const db = require('../config/database');
const policy = require('../services/privacyPolicy');
const fmt = require('../public/assets/policy-format');
const fs = require('fs');
const path = require('path');
const fail = (res, e) =>
  res
    .status(e.status || 500)
    .json({ error: e.status ? e.message : 'No se pudo gestionar la política de privacidad' });
function valid(body) {
  if (
    typeof body.title !== 'string' ||
    body.title.trim().length < 3 ||
    body.title.length > 200 ||
    typeof body.content !== 'string' ||
    body.content.trim().length < 20 ||
    body.content.length > 100000
  ) {
    const e = new Error(
      'Introduce un título (3–200 caracteres) y el texto completo (20–100.000 caracteres).'
    );
    e.status = 400;
    throw e;
  }
}
exports.current = async (req, res) => {
  try {
    const p = await policy.current();
    res.set('Cache-Control', 'no-store').json({
      id: p.id,
      title: p.title,
      published_at: p.published_at,
      legacy: p.format === 'legacy_html',
      url: '/privacidad.html?version=' + p.id,
    });
  } catch (e) {
    fail(res, e);
  }
};
exports.page = async (req, res) => {
  try {
    const p = req.query.version
      ? (
          await db.query('SELECT * FROM privacy_versions WHERE id=$1', [
            Number(req.query.version) || 0,
          ])
        ).rows[0]
      : await policy.current();
    if (!p) return res.status(404).send('Versión de política no encontrada');
    let html = fs.readFileSync(path.join(__dirname, '../public/privacidad.html'), 'utf8');
    const content = p.format === 'legacy_html' ? p.content : fmt.render(p.content);
    html = html.replace(
      /<section class="legal-content"[^>]*>[\s\S]*?<\/section>/,
      () =>
        '<section class="legal-content" style="max-width:820px;line-height:1.65">' +
        content +
        '</section>'
    );
    html = html.replace(
      '<h1>Política de privacidad</h1>',
      () => '<h1>' + fmt.escape(p.title) + '</h1>'
    );
    html = html.replace(
      /Última actualización: Junio 2026/,
      'Versión ' +
        p.id +
        (p.published_at
          ? ' · Publicada el ' + new Date(p.published_at).toLocaleDateString('es-ES')
          : ' · Texto existente de junio de 2026')
    );
    res.set('Cache-Control', 'no-store').type('html').send(html);
  } catch {
    res.status(500).send('No se ha podido cargar la política. Vuelve a intentarlo.');
  }
};
exports.admin = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json({
      draft: (await db.query('SELECT * FROM privacy_draft WHERE id=1')).rows[0],
      versions: (
        await db.query(
          'SELECT id,title,format,provenance,published_at,created_at,admin_id FROM privacy_versions ORDER BY id DESC'
        )
      ).rows,
      renewal_enabled: false,
    });
  } catch (e) {
    fail(res, e);
  }
};
exports.save = async (req, res) => {
  try {
    valid(req.body);
    const { title, content, revision } = req.body;
    const r = await db.query(
      'UPDATE privacy_draft SET title=$1,content=$2,revision=revision+1,updated_at=now(),admin_id=$3 WHERE id=1 AND revision=$4 RETURNING *',
      [title.trim(), content, req.adminId, revision]
    );
    if (!r.rows.length)
      return res.status(409).json({
        error:
          'Otra persona ha cambiado el borrador. Recarga antes de guardar; copia tu texto para conservarlo.',
      });
    res.json({ draft: r.rows[0] });
  } catch (e) {
    fail(res, e);
  }
};
exports.publish = async (req, res) => {
  try {
    if (req.body.confirm !== true)
      return res
        .status(400)
        .json({ error: 'Confirma expresamente la publicación del texto definitivo.' });
    const result = await db.transaction(async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(824601)');
      const d = (await c.query('SELECT * FROM privacy_draft WHERE id=1 FOR UPDATE')).rows[0];
      valid(d);
      if (d.revision !== req.body.revision) {
        const e = new Error('El borrador ha cambiado. Revisa la versión actual antes de publicar.');
        e.status = 409;
        throw e;
      }
      const p = (
        await c.query(
          "INSERT INTO privacy_versions(title,content,format,provenance,published_at,admin_id) VALUES($1,$2,'markdown','Publicación explícita desde administración',now(),$3) RETURNING *",
          [d.title, d.content, req.adminId]
        )
      ).rows[0];
      await c.query('UPDATE privacy_draft SET revision=revision+1 WHERE id=1');
      return p;
    });
    res.json({ version: result });
  } catch (e) {
    fail(res, e);
  }
};
exports.responses = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json({
      responses: (
        await db.query('SELECT * FROM privacy_responses WHERE socio_id=$1 ORDER BY id DESC', [
          Number(req.params.socioId) || 0,
        ])
      ).rows,
    });
  } catch (e) {
    fail(res, e);
  }
};
