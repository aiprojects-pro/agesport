const mode = require('../services/mapTestMode');
const { auditAction } = require('../middleware/auth');
exports.status = async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store'); res.json(await mode.getStatus()); } catch (err) { next(err); }
};
exports.update = (req,res) => res.status(410).json({error:'El modo temporal se ha retirado. Cada socio controla ahora su aparición en el mapa.'});

exports.diagnostics = async (req,res,next) => {
  try {
    const rows=(await require('../config/database').query(`SELECT s.id,s.nombre,s.apellidos,s.provincia,s.latitud,s.longitud,c.acepta_mapa_interactivo,c.acepta_visibilidad_datos,c.mapa_visible FROM socios s LEFT JOIN consentimientos c ON c.socio_id=s.id WHERE s.activo=true AND s.estado='aprobado' ORDER BY s.provincia,s.nombre`)).rows;
    res.set('Cache-Control','no-store');
    res.json({socios:rows.map(s=>({id:s.id,nombre:[s.nombre,s.apellidos].filter(Boolean).join(' '),provincia:s.provincia,
      ubicacion:s.latitud != null && s.longitud != null ? 'Municipio disponible' : require('../services/geocodingService').getProvinciaCoords(s.provincia) ? 'Referencia provincial aproximada; municipio pendiente' : 'Sin ubicación: revisar provincia',
      visibilidad:(s.mapa_visible ?? s.acepta_mapa_interactivo) ? 'Visible en el mapa' : 'Oculto por elección del socio',
      revisar_nombre:!s.nombre || s.nombre.trim().length<3 || !s.apellidos || /prueba|demo|test|qa/i.test(s.nombre+' '+s.apellidos)
    }))});
  } catch(err) {next(err);}
};

exports.relocate = async (req,res,next) => {
  const db=require('../config/database');
  const geo=require('../services/geocodingService');
  try {
    const id=Number(req.params.socioId);
    if(!Number.isInteger(id) || id<1) return res.status(400).json({error:'Socio inválido'});
    const s=await db.findOne('socios',{id,activo:true,estado:'aprobado'});
    if(!s) return res.status(404).json({error:'Socio no encontrado'});
    if(!s.localidad || !s.provincia) return res.status(400).json({error:'Completa provincia y localidad en el perfil'});
    let coords;try { coords=await geo.geocode(`${s.localidad}, ${s.provincia}, España`); } catch {}
    if(!coords) return res.json({actualizado:false,message:'No se pudo precisar el municipio. Se mantiene la referencia provincial si está disponible.'});
    const result=await db.query(`UPDATE socios SET latitud=$1,longitud=$2 WHERE id=$3 AND provincia=$4 AND localidad=$5 AND activo=true AND estado='aprobado' RETURNING id`,[coords.lat,coords.lng,id,s.provincia,s.localidad]);
    if(!result.rows.length) return res.status(409).json({error:'El perfil cambió durante la consulta. Actualiza el diagnóstico.'});
    await auditAction(null,req.adminId,'RECOVER_MAP_LOCATION','socios',null,{socio_id:id},req);
    res.json({actualizado:true,message:'Ubicación municipal recuperada. Actualiza el mapa para verla.'});
  } catch(err) {next(err);}
};
