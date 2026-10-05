const router = require('express').Router();
const { authenticateDelegate } = require('../middleware/auth');
const { validateInput } = require('../middleware/security');
const db = require('../config/database');
const admin = require('../controllers/adminController');
router.use(authenticateDelegate);
function scope(req, res, next) {
  const source =
    req.method === 'GET'
      ? req.query
      : req.path === '/comunicaciones/enviar'
        ? req.body.filtros
        : req.body;
  if (source != null && (typeof source !== 'object' || Array.isArray(source)))
    return res.status(400).json({ error: 'Filtros inválidos.' });
  if (source?.provincia && source.provincia !== req.delegationProvince)
    return res.status(403).json({ error: 'Solo puedes consultar y comunicarte con tu provincia.' });
  req.scopedFilters = { ...(source || {}), provincia: req.delegationProvince };
  try {
    admin.buildSocioFilterWhere(req.scopedFilters);
    next();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
router.get('/socios', scope, async (req, res) => {
  try {
    const { where, params } = admin.buildSocioFilterWhere(req.scopedFilters, false);
    const rows = (
      await db.query(
        `SELECT s.id,s.nombre,s.apellidos,s.entidad,s.localidad,s.provincia,s.tipo_socio,s.sector,
   rc.rol AS rol_cluster,rc.rol_secundario,d.nivel AS disponibilidad,
   (COALESCE(c.acepta_mensajeria,false) AND COALESCE(c.acepta_notificaciones_email,false)) AS recibe_comunicaciones
   FROM socios s LEFT JOIN consentimientos c ON c.socio_id=s.id LEFT JOIN rol_cluster rc ON rc.socio_id=s.id LEFT JOIN disponibilidad d ON d.socio_id=s.id
   ${where} ORDER BY s.apellidos,s.nombre,s.id`,
        params
      )
    ).rows;
    res.json({ provincia: req.delegationProvince, socios: rows, total: rows.length });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo consultar la delegación.' });
  }
});
router.post('/comunicaciones/preview', validateInput, scope, (req, res) => {
  req.body = req.scopedFilters;
  return admin.previewComunicacion(req, res);
});
router.post('/comunicaciones/enviar', validateInput, scope, (req, res) => {
  req.body = { ...req.body, filtros: req.scopedFilters };
  return admin.enviarComunicacion(req, res);
});
router.get('/comunicaciones', async (req, res) => {
  try {
    const rows = (
      await db.query(
        `SELECT id,asunto,total_destinatarios,enviados,fallidos,estado,created_at,finished_at FROM comunicaciones
   WHERE admin_id=$1 AND filtros->>'provincia'=$2 ORDER BY created_at DESC LIMIT 100`,
        [req.adminId, req.delegationProvince]
      )
    ).rows;
    res.json({ comunicaciones: rows });
  } catch (e) {
    res.status(500).json({ error: 'No se pudo consultar el histórico.' });
  }
});
module.exports = router;
