const db = require('../config/database');
async function canRead(req, ownerId) {
  if (req.adminId || req.socioId === ownerId) return true;
  const result = await db.query(`SELECT 1 FROM conversaciones c
    JOIN socios s ON s.id=$2 AND s.activo=true AND s.estado='aprobado'
    WHERE (c.socio_1_id=$1 AND c.socio_2_id=$2) OR (c.socio_1_id=$2 AND c.socio_2_id=$1) LIMIT 1`, [req.socioId,ownerId]);
  return result.rows.length > 0;
}
module.exports = {canRead};
