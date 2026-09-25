const path = require('path');
const db = require('../config/database');
const config = require('../config/config');
const {canRead} = require('../services/cvAccess');
exports.download = async (req,res,next) => {
  res.set('Cache-Control','private, no-store');
  const file = req.params.filename;
  if (!/^[a-zA-Z0-9._-]+$/.test(file) || file.includes('..')) return res.status(404).end();
  try {
    const owner = await db.findOne('socios', {cv_url:'/uploads/cvs/'+file});
    if (!owner || !(await canRead(req,owner.id))) return res.status(403).json({error:'No tienes permiso para descargar este CV'});
    res.download(path.join(path.resolve(config.uploads.path || './uploads'),'cvs',file), 'curriculum'+path.extname(file), err => {
      if (err && !res.headersSent) res.status(err.statusCode === 404 ? 404 : 500).json({error:'No se pudo descargar el CV'});
    });
  } catch(err) { next(err); }
};
