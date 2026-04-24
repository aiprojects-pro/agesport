// config/database.js
const { Pool } = require('pg');
const config = require('./config');

class Database {
  constructor() {
    this.pool = new Pool(config.database);
    this.connect();
  }

  async connect() {
    try {
      const client = await this.pool.connect();
      console.log('✅ Conectado a PostgreSQL');
      
      // Test PostGIS extension
      const result = await client.query('SELECT PostGIS_Version()');
      console.log(`✅ PostGIS disponible: ${result.rows[0].postgis_version}`);
      
      client.release();
    } catch (error) {
      console.error('❌ Error conectando a la base de datos:', error.message);
      process.exit(1);
    }
  }

  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      if (process.env.NODE_ENV === 'development' && duration > 100) {
        console.log(`🐌 Query lenta (${duration}ms): ${text.substring(0, 50)}...`);
      }
      
      return result;
    } catch (error) {
      console.error('❌ Error en query:', error.message);
      throw error;
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Helpers para queries comunes
  async findOne(table, conditions, select = '*') {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const query = `SELECT ${select} FROM ${table} WHERE ${whereClause} LIMIT 1`;
    const values = Object.values(conditions);
    
    const result = await this.query(query, values);
    return result.rows[0] || null;
  }

  async findMany(table, conditions = {}, options = {}) {
    const { select = '*', orderBy = '', limit = '', offset = '' } = options;
    
    let query = `SELECT ${select} FROM ${table}`;
    let values = [];
    
    if (Object.keys(conditions).length > 0) {
      const whereClause = Object.keys(conditions)
        .map((key, index) => `${key} = $${index + 1}`)
        .join(' AND ');
      query += ` WHERE ${whereClause}`;
      values = Object.values(conditions);
    }
    
    if (orderBy) query += ` ORDER BY ${orderBy}`;
    if (limit) query += ` LIMIT ${limit}`;
    if (offset) query += ` OFFSET ${offset}`;
    
    const result = await this.query(query, values);
    return result.rows;
  }

  async insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, index) => `$${index + 1}`).join(', ');
    
    const query = `
      INSERT INTO ${table} (${keys.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  async update(table, data, conditions) {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    const conditionKeys = Object.keys(conditions);
    const conditionValues = Object.values(conditions);
    
    const setClause = dataKeys
      .map((key, index) => `${key} = $${index + 1}`)
      .join(', ');
    
    const whereClause = conditionKeys
      .map((key, index) => `${key} = $${dataValues.length + index + 1}`)
      .join(' AND ');
    
    const query = `
      UPDATE ${table} 
      SET ${setClause} 
      WHERE ${whereClause}
      RETURNING *
    `;
    
    const result = await this.query(query, [...dataValues, ...conditionValues]);
    return result.rows[0];
  }

  async delete(table, conditions) {
    const whereClause = Object.keys(conditions)
      .map((key, index) => `${key} = $${index + 1}`)
      .join(' AND ');
    
    const query = `DELETE FROM ${table} WHERE ${whereClause} RETURNING *`;
    const values = Object.values(conditions);
    
    const result = await this.query(query, values);
    return result.rows[0];
  }

  // Query específica para búsqueda geográfica
  async findNearby(lat, lng, radiusKm = 50, filters = {}) {
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
    let values = [lng, lat, radiusKm];
    let paramIndex = 4;
    
    // Añadir filtros adicionales
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
    
    const result = await this.query(query, values);
    return result.rows;
  }

  // Estadísticas para dashboard
  async getObservatorioStats() {
    const result = await this.query('SELECT * FROM vista_stats_observatorio');
    return result.rows[0];
  }

  // Búsqueda full-text
  async searchSocios(searchTerm, filters = {}) {
    let query = `
      SELECT *, 
             ts_rank(to_tsvector('spanish', nombre || ' ' || apellidos || ' ' || COALESCE(entidad, '')), 
                     plainto_tsquery('spanish', $1)) as relevancia
      FROM vista_socios_completos 
      WHERE to_tsvector('spanish', nombre || ' ' || apellidos || ' ' || COALESCE(entidad, ''))
            @@ plainto_tsquery('spanish', $1)
    `;
    
    let values = [searchTerm];
    let paramIndex = 2;
    
    // Aplicar filtros
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'especialidad' && Array.isArray(value)) {
          query += ` AND especialidades && $${paramIndex}`;
          values.push(value);
        } else if (key === 'anos_experiencia_min') {
          query += ` AND anos_experiencia >= $${paramIndex}`;
          values.push(value);
        } else {
          query += ` AND ${key} = $${paramIndex}`;
          values.push(value);
        }
        paramIndex++;
      }
    });
    
    query += ` ORDER BY relevancia DESC, nombre`;
    
    const result = await this.query(query, values);
    return result.rows;
  }

  async close() {
    await this.pool.end();
    console.log('🔒 Pool de conexiones cerrado');
  }
}

// Singleton instance
const db = new Database();

module.exports = db;
