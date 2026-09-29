// services/sociosQueries.js
// Queries específicas del dominio de socios: PostGIS para búsqueda
// geográfica y full-text en español para búsqueda libre.

const db = require('../config/database');

// Búsqueda geográfica por radio en km (lat/lng del centro).
async function findNearby(lat, lng, radiusKm = 50, filters = {}) {
  const baseQuery = `
    SELECT *,
           ST_Distance(punto_geografico, ST_SetSRID(ST_MakePoint($1, $2), 4326)) / 1000 as distancia_km
    FROM vista_socios_perfil
    WHERE ST_DWithin(
      punto_geografico,
      ST_SetSRID(ST_MakePoint($1, $2), 4326),
      $3 * 1000
    )
  `;

  let query = baseQuery;
  const values = [lng, lat, radiusKm];
  let paramIndex = 4;

  if (filters.provincia) {
    query += ` AND provincia = $${paramIndex}`;
    values.push(filters.provincia);
    paramIndex++;
  }
  if (filters.rol_cluster) {
    query += ` AND (rol_cluster = $${paramIndex} OR rol_secundario = $${paramIndex})`;
    values.push(filters.rol_cluster);
    paramIndex++;
  }
  if (filters.especialidad) {
    query += ` AND $${paramIndex} = ANY(especialidades)`;
    values.push(filters.especialidad);
    paramIndex++;
  }

  query += ` ORDER BY distancia_km`;
  const result = await db.query(query, values);
  return result.rows;
}

// Whitelist de columnas filtrables por searchSocios. La rama "else" del
// loop interpola `key` directo en SQL — sin esta validación, un caller
// descuidado podría pasar un nombre de columna malicioso y abrir un
// SQLi (todos los callers actuales pasan claves curadas, pero defensa
// en profundidad). 'especialidad' y 'anos_experiencia_min' tienen su
// propia rama dedicada.
const SEARCH_FILTERABLE_COLUMNS = new Set([
  'provincia',
  'comunidad_autonoma',
  'rol_cluster',
  'sector',
  'disponibilidad',
  'tipo_socio',
  'ambito',
  'estado',
  'activo',
  'b2b_ofrece',
  'b2b_busca',
  'b2b_licita',
]);

// Búsqueda libre sobre nombre, apellidos, entidad, organización, cargo y
// localidad. Antes se usaba full-text en español (stemming): nombres
// propios parciales ("Ros" → Rosario) o con/sin tilde no aparecían al
// filtrar. Ahora cada palabra debe aparecer (ILIKE, sin distinguir
// mayúsculas ni tildes) en alguno de esos campos.
const ACCENTS_FROM = 'áàäâéèëêíìïîóòöôúùüûñçÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇ';
const ACCENTS_TO = 'aaaaeeeeiiiioooouuuuncAAAAEEEEIIIIOOOOUUUUNC';
const fold = (v) => String(v).split('').map((c) => {
  const i = ACCENTS_FROM.indexOf(c);
  return i === -1 ? c : ACCENTS_TO[i];
}).join('').toLowerCase();

async function searchSocios(searchTerm, filters = {}, viewerId = null) {
  const words = fold(searchTerm).replace(/[%_\\]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8);
  const haystack = `lower(translate(concat_ws(' ', nombre, apellidos, entidad, nombre_organizacion, cargo_actual, localidad), '${ACCENTS_FROM}', '${ACCENTS_TO}'))`;
  let query = `
    SELECT *
    FROM vista_socios_perfil
    WHERE (acepta_visibilidad_datos=true OR id=$1)
  `;
  const values = [viewerId];
  let paramIndex = 2;
  for (const word of words) {
    query += ` AND ${haystack} LIKE $${paramIndex++}`;
    values.push('%' + word + '%');
  }
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'rol_cluster') {
        query += ` AND (rol_cluster = $${paramIndex} OR rol_secundario = $${paramIndex})`;
        values.push(value);
      } else if (key === 'especialidad' && Array.isArray(value)) {
        query += ` AND especialidades && $${paramIndex}`;
        values.push(value);
      } else if (key === 'anos_experiencia_min') {
        query += ` AND anos_experiencia >= $${paramIndex}`;
        values.push(value);
      } else if (SEARCH_FILTERABLE_COLUMNS.has(key)) {
        // Sólo columnas en la whitelist se interpolan en SQL.
        query += ` AND ${key} = $${paramIndex}`;
        values.push(value);
      } else {
        // Filtro no reconocido: ignoramos silenciosamente para que un
        // mal caller no abra SQLi. (Alternativa: throw — pero los
        // callers actuales asumen tolerancia a claves desconocidas).
        return;
      }
      paramIndex++;
    }
  });

  query += ` ORDER BY nombre, apellidos`;
  const result = await db.query(query, values);
  return result.rows;
}

// Conteos agregados por provincia para el visor PÚBLICO de la landing.
// Cuenta todas las cuentas aprobadas y activas (no sólo las geolocalizadas)
// para dar una imagen real del volumen. Sólo agregados, sin PII. El
// desglose por perfil agrupa en "otros" los perfiles con menos de
// `minGroup` socios en una provincia para no permitir identificar a nadie.
async function socioCountsByProvincia({ minGroup = 3 } = {}) {
  const provinceCoords = require('../config/provinceCoordinates');
  const result = await db.query(`
    SELECT s.provincia, rc.rol AS rol_cluster, COUNT(*)::int AS count
    FROM socios s
    LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
    WHERE s.estado = 'aprobado' AND s.activo = true AND s.provincia IS NOT NULL
    GROUP BY s.provincia, rc.rol
  `);
  const byProv = new Map();
  for (const row of result.rows) {
    if (!byProv.has(row.provincia)) byProv.set(row.provincia, { provincia: row.provincia, count: 0, roles: {} });
    const p = byProv.get(row.provincia);
    p.count += row.count;
    const key = row.rol_cluster || 'sin_rol';
    p.roles[key] = (p.roles[key] || 0) + row.count;
  }
  return [...byProv.values()].map((p) => {
    const roles = [];
    let otros = 0;
    for (const [rol, count] of Object.entries(p.roles)) {
      if (rol !== 'sin_rol' && count >= minGroup) roles.push({ rol_cluster: rol, count });
      else otros += count;
    }
    roles.sort((a, b) => b.count - a.count);
    const c = provinceCoords[p.provincia];
    return {
      provincia: p.provincia,
      count: p.count,
      lat: c ? c[0] : null,
      lng: c ? c[1] : null,
      roles,
      otros,
    };
  }).sort((a, b) => a.provincia.localeCompare(b.provincia, 'es'));
}

module.exports = { findNearby, searchSocios, socioCountsByProvincia };
