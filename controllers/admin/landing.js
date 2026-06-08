// controllers/admin/landing.js
// CMS de la landing pública. CRUD muy simple sobre `landing_content`.
const db = require('../../config/database');
const { auditAction } = require('../../middleware/auth');
const { toPublicUrl, removeFile } = require('../../services/uploadService');

async function listContent(req, res) {
  try {
    const result = await db.query(
      'SELECT clave, valor, tipo, updated_at FROM landing_content ORDER BY clave'
    );
    res.json({ content: result.rows });
  } catch (error) {
    console.error('Error listando landing_content:', error);
    res.status(500).json({ error: 'Error listando contenido de landing' });
  }
}

async function updateContent(req, res) {
  try {
    const { clave } = req.params;
    const { valor } = req.body;
    if (typeof valor !== 'string') {
      return res.status(400).json({ error: 'valor debe ser una cadena' });
    }
    if (valor.length > 5000) {
      return res.status(400).json({ error: 'valor demasiado largo (>5000 chars)' });
    }

    const existing = await db.findOne('landing_content', { clave });
    if (!existing) {
      return res.status(404).json({ error: 'Clave no encontrada' });
    }
    // PUT con texto sobre clave de tipo imagen: usar el endpoint /imagen
    if (existing.tipo === 'image') {
      return res.status(400).json({
        error: 'Esta clave es de tipo imagen. Usa POST /api/admin/landing/:clave/imagen.',
      });
    }

    const result = await db.query(
      `UPDATE landing_content
       SET valor = $1, updated_at = NOW(), updated_by = $2
       WHERE clave = $3
       RETURNING clave, valor, tipo, updated_at`,
      [valor, req.adminId, clave]
    );

    await auditAction(
      null,
      req.adminId,
      'UPDATE_LANDING_CONTENT',
      'landing_content',
      existing,
      result.rows[0],
      req
    );

    res.json({ message: 'Contenido actualizado', content: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando landing_content:', error);
    res.status(500).json({ error: 'Error actualizando contenido' });
  }
}

// Sube una imagen y actualiza el valor de la clave con la URL pública.
// La clave debe existir y ser de tipo 'image'.
async function uploadImage(req, res) {
  try {
    const { clave } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha recibido ningún fichero' });
    }

    const existing = await db.findOne('landing_content', { clave });
    if (!existing) {
      return res.status(404).json({ error: 'Clave no encontrada' });
    }
    if (existing.tipo !== 'image') {
      return res.status(400).json({ error: 'La clave no es de tipo imagen' });
    }

    const url = toPublicUrl('landing', req.file.filename);
    const result = await db.query(
      `UPDATE landing_content
       SET valor = $1, updated_at = NOW(), updated_by = $2
       WHERE clave = $3
       RETURNING clave, valor, tipo, updated_at`,
      [url, req.adminId, clave]
    );

    // Limpia el fichero antiguo del disco. Antes, reemplazar una imagen
    // del CMS dejaba un fichero huérfano en /uploads/landing/ sin
    // referencia desde la BD — fuga lenta de espacio en disco. Lo
    // hacemos DESPUÉS del UPDATE para que un error de borrado nunca
    // rollee el cambio de la imagen nueva en BD.
    if (existing.valor && existing.valor !== url) {
      removeFile(existing.valor);
    }

    await auditAction(
      null,
      req.adminId,
      'UPLOAD_LANDING_IMAGE',
      'landing_content',
      existing,
      result.rows[0],
      req
    );

    res.json({ message: 'Imagen subida', content: result.rows[0] });
  } catch (error) {
    console.error('Error subiendo imagen de landing:', error);
    res.status(500).json({ error: 'Error subiendo imagen' });
  }
}

module.exports = { listContent, updateContent, uploadImage };
