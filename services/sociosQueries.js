// services/sociosQueries.js
// Queries específicas del dominio de socios: PostGIS para búsqueda
// geográfica y full-text en español para búsqueda libre.

const db = require('../config/database');

// Búsqueda geográfica por radio en km (lat/lng del centro).
async function findNearby(lat, lng, radiusKm = 50, filters = {}) {
  const baseQuery = `
    SELECT *,
           ST_Distance(punto_geografico, ST_SetSRID(ST_MakePoint($1, $2), 4326)) / 1000 as distancia_km
    FROM vista_socios_completos
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
    query += ` AND rol_cluster = $${paramIndex}`;
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
  'tipo_socio',
  'ambito',
  'estado',
  'activo',
]);

// Búsqueda full-text en español sobre nombre, apellidos y entidad.
async function searchSocios(searchTerm, filters = {}) {
  let query = `
    SELECT *,
           ts_rank(to_tsvector('spanish', nombre || ' ' || apellidos || ' ' || COALESCE(entidad, '')),
                   plainto_tsquery('spanish', $1)) as relevancia
    FROM vista_socios_completos
    WHERE to_tsvector('spanish', nombre || ' ' || apellidos || ' ' || COALESCE(entidad, ''))
          @@ plainto_tsquery('spanish', $1)
  `;

  const values = [searchTerm];
  let paramIndex = 2;

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      if (key === 'especialidad' && Array.isArray(value)) {
        query += ` AND especialidades && ${paramIndex}`;
        values.push(value);
      } else if (key === 'anos_experiencia_min') {
        query += ` AND anos_experiencia >= ${paramIndex}`;
        values.push(value);
      } else if (SEARCH_FILTERABLE_COLUMNS.has(key)) {
        // Sólo columnas en la whitelist se interpolan en SQL.
        query += ` AND ${key} = ${paramIndex}`;
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

  query += ` ORDER BY relevancia DESC, nombre`;
  const result = await db.query(query, values);
  return result.rows;
}

// Conteos agregados por provincia con centroide promedio.
// Usado por el visor PÚBLICO de la landing — devuelve sólo agregados
// (no PII) para no requerir consentimiento individual de cada socio.
async function socioCountsByProvincia() {
  const result = await db.query(`
    SELECT provincia,
           COUNT(*)::int AS count,
           AVG(latitud)::float AS lat,
           AVG(longitud)::float AS lng
    FROM socios
    WHERE estado = 'aprobado'
      AND activo = true
      AND latitud IS NOT NULL
      AND longitud IS NOT NULL
    GROUP BY provincia
    ORDER BY provincia
  `);
  return result.rows;
}

module.exports = { findNearby, searchSocios, socioCountsByProvincia };
