const db = require('../config/database');
const KEY = 'mapa_prueba_temporal';
async function getStatus() {
  const row = await db.findOne('configuracion', { clave: KEY });
  let value = {};
  try { value = JSON.parse(row?.valor || '{}'); } catch {}
  const enabled = value.enabled === true && Number.isFinite(Date.parse(value.expiresAt)) && Date.parse(value.expiresAt) > Date.now();
  return { enabled, expiresAt: enabled ? value.expiresAt : null };
}
async function setEnabled(enabled, adminId) {
  const value = { enabled, expiresAt: enabled ? new Date(Date.now() + 7 * 86400000).toISOString() : null };
  await db.query(`INSERT INTO configuracion(clave,valor,tipo,descripcion,updated_by)
    VALUES($1,$2,'json','Mapa temporal de prueba: todas las cuentas aprobadas y activas',$3)
    ON CONFLICT(clave) DO UPDATE SET valor=EXCLUDED.valor,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
    [KEY, JSON.stringify(value), adminId]);
  return value;
}
module.exports = { KEY, getStatus, setEnabled };
