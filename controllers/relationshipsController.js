const db = require('../config/database');
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (value, label, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw error(label + ': texto requerido (máximo ' + max + ' caracteres)');
  return value.trim();
};
const id = (value) => {
  if (!Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw error('Identificador inválido');
  return Number(value);
};
const date = (value) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw error('Fecha inválida');
  return value;
};
const fail = (res, e) =>
  res.status(e.status || (['23503', '23514', '22007', '22008'].includes(e.code) ? 400 : 500)).json({
    error: e.status
      ? e.message
      : 'No se pudo guardar. Revisa las fechas y las referencias seleccionadas.',
  });
async function history(c, req, tipo, recurso, datos) {
  await c.query(
    'INSERT INTO vinculos_historial(tipo,recurso_id,admin_id,datos) VALUES($1,$2,$3,$4)',
    [tipo, recurso, req.adminId, JSON.stringify(datos)]
  );
}
exports.list = async (req, res) => {
  try {
    const result = await db.transaction(async (c) => ({
      empresas: (await c.query('SELECT * FROM empresas_vinculadas ORDER BY nombre')).rows,
      patrocinios: (
        await c.query(
          'SELECT p.*,p.inicio::text inicio,p.fin::text fin,e.nombre empresa FROM patrocinios p JOIN empresas_vinculadas e ON e.id=p.empresa_id ORDER BY p.id DESC'
        )
      ).rows,
      personas: (
        await c.query(
          'SELECT id,nombre,apellidos,estado,activo,tipo_socio FROM socios ORDER BY apellidos,nombre'
        )
      ).rows,
      vinculos: (
        await c.query(`SELECT v.*,v.inicio::text inicio,v.fin::text fin,s.nombre,s.apellidos,s.tipo_socio,s.estado estado_cuenta,s.activo cuenta_activa,e.nombre empresa,p.modalidad,
 CASE WHEN v.inicio>CURRENT_DATE THEN 'previsto' WHEN v.fin IS NOT NULL AND v.fin<CURRENT_DATE THEN 'finalizado' ELSE 'vigente' END estado_vinculo
 FROM vinculos_persona v JOIN socios s ON s.id=v.socio_id JOIN empresas_vinculadas e ON e.id=v.empresa_id LEFT JOIN patrocinios p ON p.id=v.patrocinio_id ORDER BY v.id DESC`)
      ).rows,
      historial: (
        await c.query(
          'SELECT h.*,a.nombre administrador FROM vinculos_historial h LEFT JOIN administradores a ON a.id=h.admin_id ORDER BY h.id DESC LIMIT 100'
        )
      ).rows,
      derechos_automaticos: false,
    }));
    res.set('Cache-Control', 'no-store').json(result);
  } catch (e) {
    fail(res, e);
  }
};
exports.company = async (req, res) => {
  try {
    const nombre = text(req.body.nombre, 'Nombre', 300),
      referencia = req.body.referencia ? text(req.body.referencia, 'Referencia', 200) : null;
    const row = await db.transaction(async (c) => {
      let r;
      if (req.params.id)
        r = (
          await c.query(
            'UPDATE empresas_vinculadas SET nombre=$1,referencia=$2 WHERE id=$3 RETURNING *',
            [nombre, referencia, id(req.params.id)]
          )
        ).rows[0];
      else
        r = (
          await c.query(
            'INSERT INTO empresas_vinculadas(nombre,referencia) VALUES($1,$2) RETURNING *',
            [nombre, referencia]
          )
        ).rows[0];
      if (!r) throw error('Empresa no encontrada', 404);
      await history(c, req, 'empresa', r.id, r);
      return r;
    });
    res.json(row);
  } catch (e) {
    fail(res, e);
  }
};
exports.sponsor = async (req, res) => {
  try {
    const b = req.body,
      empresa = id(b.empresa_id),
      modalidad = text(b.modalidad, 'Modalidad', 200),
      inicio = date(b.inicio),
      fin = b.fin ? date(b.fin) : null,
      notas = b.notas ? text(b.notas, 'Notas', 2000) : null;
    if (fin && fin < inicio) throw error('La fecha final debe ser posterior al inicio');
    // Draft configuration only. No authorization code reads these proposed conditions.
    const futura = {
      estado: 'pendiente_aprobacion',
      cupos: b.cupo_propuesto == null || b.cupo_propuesto === '' ? null : Number(b.cupo_propuesto),
      condiciones: b.condiciones_propuestas
        ? text(b.condiciones_propuestas, 'Condiciones propuestas', 4000)
        : null,
    };
    if (
      futura.cupos !== null &&
      (!Number.isInteger(futura.cupos) || futura.cupos < 0 || futura.cupos > 100000)
    )
      throw error('Cupo propuesto inválido');
    const r = await db.transaction(async (c) => {
      let row;
      if (req.params.id) {
        const old = (
          await c.query(
            'SELECT *,inicio::text inicio,fin::text fin FROM patrocinios WHERE id=$1 FOR UPDATE',
            [id(req.params.id)]
          )
        ).rows[0];
        if (!old) throw error('Patrocinio no encontrado', 404);
        if (old.empresa_id !== empresa)
          throw error(
            'La empresa de un patrocinio no se cambia; crea otro patrocinio para conservar los vínculos'
          );
        row = (
          await c.query(
            'UPDATE patrocinios SET modalidad=$1,inicio=$2,fin=$3,notas=$4,configuracion_futura=$5 WHERE id=$6 RETURNING *,inicio::text inicio,fin::text fin',
            [modalidad, inicio, fin, notas, JSON.stringify(futura), old.id]
          )
        ).rows[0];
      } else
        row = (
          await c.query(
            'INSERT INTO patrocinios(empresa_id,modalidad,inicio,fin,notas,configuracion_futura) VALUES($1,$2,$3,$4,$5,$6) RETURNING *,inicio::text inicio,fin::text fin',
            [empresa, modalidad, inicio, fin, notas, JSON.stringify(futura)]
          )
        ).rows[0];
      await history(c, req, 'patrocinio', row.id, row);
      return row;
    });
    res.json(r);
  } catch (e) {
    fail(res, e);
  }
};
exports.link = async (req, res) => {
  try {
    const b = req.body,
      persona = id(b.socio_id),
      empresa = id(b.empresa_id),
      patrocinio = b.patrocinio_id ? id(b.patrocinio_id) : null,
      motivo = text(b.motivo, 'Motivo del vínculo', 1000),
      inicio = date(b.inicio),
      fin = b.fin ? date(b.fin) : null;
    if (fin && fin < inicio) throw error('La fecha final debe ser posterior al inicio');
    const row = await db.transaction(async (c) => {
      if (patrocinio) {
        const p = (
          await c.query('SELECT empresa_id FROM patrocinios WHERE id=$1 FOR SHARE', [patrocinio])
        ).rows[0];
        if (!p || p.empresa_id !== empresa)
          throw error('El patrocinio no pertenece a esta empresa');
      }
      const r = (
        await c.query(
          'INSERT INTO vinculos_persona(socio_id,empresa_id,patrocinio_id,motivo,inicio,fin,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,inicio::text inicio,fin::text fin',
          [persona, empresa, patrocinio, motivo, inicio, fin, req.adminId]
        )
      ).rows[0];
      await history(c, req, 'vinculo', r.id, r);
      return r;
    });
    res.status(201).json(row);
  } catch (e) {
    fail(res, e);
  }
};
exports.end = async (req, res) => {
  try {
    const fin = date(req.body.fin);
    const r = await db.transaction(async (c) => {
      const old = (
        await c.query(
          'SELECT *,inicio::text inicio,fin::text fin FROM vinculos_persona WHERE id=$1 FOR UPDATE',
          [id(req.params.id)]
        )
      ).rows[0];
      if (!old) throw error('Vínculo no encontrado', 404);
      const updated = (
        await c.query(
          'UPDATE vinculos_persona SET fin=$1 WHERE id=$2 RETURNING *,inicio::text inicio,fin::text fin',
          [fin, old.id]
        )
      ).rows[0];
      await history(c, req, 'fin_vinculo', old.id, { anterior: old, actual: updated });
      return updated;
    });
    res.json(r);
  } catch (e) {
    fail(res, e);
  }
};
