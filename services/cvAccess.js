const db = require('../config/database');
// Un CV sólo lo ven el propio socio, administración y los socios a los que
// el titular ha escrito. Antes bastaba con que existiera una conversación,
// y cualquiera podía abrirla enviando un primer mensaje al titular.
async function canRead(req, ownerId) {
  if (req.adminId || req.socioId === ownerId) return true;
  if (!req.socioId) return false;
  const result = await db.query(`SELECT 1 FROM mensajes m
    JOIN socios s ON s.id=$2 AND s.activo=true AND s.estado='aprobado'
    WHERE m.emisor_id=$2 AND m.receptor_id=$1 LIMIT 1`, [req.socioId, ownerId]);
  return result.rows.length > 0;
}
module.exports = {canRead};
