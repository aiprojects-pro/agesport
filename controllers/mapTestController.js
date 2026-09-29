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

// Geolocalización masiva de los socios aprobados sin municipio. Corre en
// segundo plano respetando el límite de Nominatim (1 petición/segundo).
let bulkRunning = false;
exports.bulkRelocate = async (req,res,next) => {
  const db=require('../config/database');
  const geo=require('../services/geocodingService');
  try {
    if (bulkRunning) return res.status(409).json({error:'Ya hay una geolocalización en curso. Actualiza el diagnóstico en unos minutos.'});
    const rows=(await db.query(`SELECT id,localidad,provincia FROM socios
      WHERE activo=true AND estado='aprobado' AND (latitud IS NULL OR longitud IS NULL)
        AND COALESCE(trim(localidad),'')<>'' AND COALESCE(trim(provincia),'')<>'' ORDER BY id`)).rows;
    await auditAction(null,req.adminId,'BULK_RECOVER_MAP_LOCATION','socios',null,{pendientes:rows.length},req);
    res.json({pendientes:rows.length,message:rows.length ? `Geolocalizando ${rows.length} perfiles en segundo plano (aprox. ${Math.ceil(rows.length*1.1)} s). Actualiza el diagnóstico al terminar.` : 'No hay perfiles pendientes de ubicar.'});
    if (!rows.length) return;
    bulkRunning = true;
    const delay = process.env.NODE_ENV === 'test' ? 0 : 1100;
    setImmediate(async () => {
      let ok=0;
      try {
        for (const s of rows) {
          try {
            const coords=await geo.geocode(`${s.localidad}, ${s.provincia}, España`);
            if (coords) {
              const r=await db.query(`UPDATE socios SET latitud=$1,longitud=$2 WHERE id=$3 AND localidad=$4 AND provincia=$5 AND latitud IS NULL RETURNING id`,[coords.lat,coords.lng,s.id,s.localidad,s.provincia]);
              ok+=r.rows.length;
            }
          } catch (e) { /* municipio no localizable: queda la referencia provincial */ }
          if (delay) await new Promise(r=>setTimeout(r,delay));
        }
        console.log(`[geocode] geolocalización masiva: ${ok}/${rows.length} perfiles ubicados`);
      } finally { bulkRunning = false; }
    });
  } catch(err) {bulkRunning=false;next(err);}
};
