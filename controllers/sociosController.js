// controllers/sociosController.js
const db = require('../config/database');
const sociosQueries = require('../services/sociosQueries');
const { 
  filterSensitiveData, 
  canViewSocio, 
  auditAction, 
  encryptData, 
  decryptData 
} = require('../middleware/auth');
const geocodingService = require('../services/geocodingService');
const uploadService = require('../services/uploadService');
const catalogos = require('../config/catalogos');
const sentinels = require('../services/messageSentinels');

class SociosController {

  // ==================== DIRECTORIO PÚBLICO (solo socios autenticados) ====================
  
  async getDirectorio(req, res) {
    try {
      const {
        search = '',
        provincia = '',
        rol_cluster = '',
        sector = '',
        especialidad = '',
        disponibilidad = '',
        anos_experiencia_min = '',
        b2b_ofrece = '',
        b2b_busca = '',
        b2b_licita = '',
        ambito = '',
        tipo_socio = '',
        page = 1,
        limit = 20
      } = req.query;

      let socios;
      
      // Si hay término de búsqueda, usar búsqueda full-text
      if (search.trim()) {
        const filters = {
          provincia: provincia || undefined,
          rol_cluster: rol_cluster || undefined,
          sector: sector || undefined,
          disponibilidad: disponibilidad || undefined,
          especialidad: especialidad ? [especialidad] : undefined,
          tipo_socio: tipo_socio || undefined,
          b2b_ofrece: b2b_ofrece === 'true' ? true : undefined,
          b2b_busca: b2b_busca === 'true' ? true : undefined,
          b2b_licita: b2b_licita === 'true' ? true : undefined,
          anos_experiencia_min: anos_experiencia_min ? parseInt(anos_experiencia_min) : undefined
        };
        
        // Filtrar valores vacíos
        Object.keys(filters).forEach(key => 
          filters[key] === undefined && delete filters[key]
        );

        socios = await sociosQueries.searchSocios(search, filters, req.socioId);
      } else {
        // Construir query con filtros
        let query = 'SELECT * FROM vista_socios_completos WHERE (acepta_visibilidad_datos=true OR id=$1)';
        const params = [req.socioId];
        let paramIndex = 2;

        if (provincia) {
          query += ` AND provincia = $${paramIndex}`;
          params.push(provincia);
          paramIndex++;
        }

        if (sector) { query += ` AND sector = $${paramIndex++}`; params.push(sector); }
        if (rol_cluster) {
          query += ` AND (rol_cluster = $${paramIndex} OR rol_secundario = $${paramIndex})`;
          params.push(rol_cluster);
          paramIndex++;
        }

        if (especialidad) {
          query += ` AND $${paramIndex} = ANY(especialidades)`;
          params.push(especialidad);
          paramIndex++;
        }

        if (disponibilidad) {
          query += ` AND disponibilidad = $${paramIndex}`;
          params.push(disponibilidad);
          paramIndex++;
        }

        if (anos_experiencia_min) {
          query += ` AND anos_experiencia >= $${paramIndex}`;
          params.push(parseInt(anos_experiencia_min));
          paramIndex++;
        }

        if (b2b_ofrece === 'true') {
          query += ` AND b2b_ofrece = true`;
        }

        if (b2b_busca === 'true') {
          query += ` AND b2b_busca = true`;
        }

        if (b2b_licita === 'true') {
          query += ` AND b2b_licita = true`;
        }

        if (ambito) {
          query += ` AND ambito = $${paramIndex}`;
          params.push(ambito);
          paramIndex++;
        }

        if (tipo_socio) {
          query += ` AND tipo_socio = $${paramIndex}`;
          params.push(tipo_socio);
          paramIndex++;
        }

        // Paginación
        const offset = (page - 1) * limit;
        query += ` ORDER BY nombre, apellidos LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await db.query(query, params);
        socios = result.rows;
      }

      // Descifrar teléfono y filtrar datos sensibles según permisos del viewer.
      // filterSensitiveData decide si el teléfono se queda visible según el
      // consentimiento `visible_telefono` (y siempre lo descarta para no-owners
      // sin consentimiento).
      const sociosFiltrados = socios.map((socio) => {
        const isOwner = socio.id === req.socioId;
        const isAdmin = !!req.adminId;
        if (socio.telefono_encrypted) {
          socio.telefono = decryptData(socio.telefono_encrypted);
        }
        if (socio.telefono_personal_encrypted) socio.telefono_personal = decryptData(socio.telefono_personal_encrypted);
        return filterSensitiveData(socio, isOwner, isAdmin);
      });

      // Auditar búsqueda
      await auditAction(req.socioId, req.adminId, 'SEARCH_DIRECTORY', 'socios', null, { 
        search, filters: req.query, results_count: socios.length 
      }, req);

      res.json({
        socios: sociosFiltrados,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: socios.length
        },
        filters: req.query
      });

    } catch (error) {
      console.error('Error en getDirectorio:', error);
      res.status(500).json({ error: 'Error obteniendo directorio de socios' });
    }
  }

  // ==================== MAPA INTRANET ====================
  // Devuelve un array de socios con coordenadas + identidad, filtrado
  // por consentimientos. Solo socios autenticados; se sirve desde
  // /api/socios/mapa. Visibilidad individual independiente del directorio.
  // Administración conserva la vista de gestión de todas las cuentas activas.
  async getMapaSocios(req, res) {
    try {
      const viewerId = req.socioId || null;
      const testMode = await require('../services/mapTestMode').getStatus();
      const result = await db.query(`
        SELECT s.id, s.nombre, s.apellidos, s.entidad, s.provincia, s.localidad,
               s.comunidad_autonoma, s.latitud, s.longitud, c.acepta_visibilidad_datos, c.acepta_mensajeria,
               s.sexo, s.tipo_socio, s.ambito, s.sector, s.anos_experiencia,
               s.fecha_registro, s.ultimo_acceso,
               rc.rol AS rol_cluster, rc.rol_secundario,
               rc.b2b_ofrece, rc.b2b_busca, rc.b2b_licita,
               d.nivel AS disponibilidad,
               d.tutor_mentor,
               (
                 SELECT COALESCE(array_agg(especialidad ORDER BY orden_prioridad), ARRAY[]::varchar[])
                 FROM socio_especialidades
                 WHERE socio_id = s.id
               ) AS especialidades
        FROM socios s
        LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
        LEFT JOIN disponibilidad d ON d.socio_id = s.id
        LEFT JOIN consentimientos c ON c.socio_id = s.id
        WHERE s.estado = 'aprobado'
          AND s.activo = true
          AND ($1::boolean OR COALESCE(c.mapa_visible,c.acepta_mapa_interactivo,false))
      `, [!!req.adminId]);
      const located = result.rows.map(r => {
        const hasCoords = r.latitud != null && r.longitud != null && Number.isFinite(Number(r.latitud)) && Number.isFinite(Number(r.longitud));
        const coords = hasCoords ? {lat: Number(r.latitud), lng: Number(r.longitud)} : geocodingService.getProvinciaCoords(r.provincia);
        return {...r, coords, precision: hasCoords ? 'municipio' : 'provincia'};
      });
      res.set('Cache-Control', 'no-store');
      res.json({
        modo_prueba: testMode,
        total_elegibles: located.length,
        sin_ubicacion: located.filter(r => !r.coords).length,
        socios: located.filter(r => r.coords).map((r) => ({
          id: r.id,
          nombre: r.nombre,
          apellidos: r.apellidos,
          entidad: r.entidad,
          provincia: r.provincia,
          comunidad_autonoma: r.comunidad_autonoma,
          localidad: r.localidad,
          rol_cluster: r.rol_cluster,
          rol_secundario: r.rol_secundario,
          lat: r.coords.lat,
          lng: r.coords.lng,
          precision: r.precision,
          perfil_visible: !!req.adminId || r.id === viewerId || !!r.acepta_visibilidad_datos,
          mensajeria: !!r.acepta_mensajeria,
          disponibilidad: r.disponibilidad || null,
          tutor_mentor: !!r.tutor_mentor,
          b2b_ofrece: !!r.b2b_ofrece,
          b2b_busca: !!r.b2b_busca,
          b2b_licita: !!r.b2b_licita,
          especialidades: Array.isArray(r.especialidades) ? r.especialidades : [],
          sexo: r.sexo || null,
          tipo_socio: r.tipo_socio || null,
          sector: r.sector || null,
          ambito: r.ambito || null,
          anos_experiencia: r.anos_experiencia == null ? null : Number(r.anos_experiencia),
          fecha_registro: r.fecha_registro,
          ultimo_acceso: r.ultimo_acceso,
        })),
      });
    } catch (error) {
      console.error('Error en mapa intranet:', error);
      res.status(500).json({ error: 'Error obteniendo el mapa' });
    }
  }

  // ==================== FEED DE NOVEDADES ====================
  // GET /api/socios/feed — datos para el "muro" del dashboard del socio:
  //   - últimas 5 altas en la misma provincia
  //   - hasta 5 socios que ofrecen servicios B2B
  //   - hasta 5 socios que buscan proveedores B2B
  // Todo respeta consentimiento acepta_visibilidad_datos y excluye al propio
  // socio consultante.
  async getFeed(req, res) {
    try {
      const socioId = req.socioId;
      const yo = await db.findOne('socios', { id: socioId }, 'provincia');

      const cerca = await db.query(`
        SELECT s.id, s.nombre, s.apellidos, s.entidad, s.provincia,
               s.localidad, s.foto_url, s.fecha_registro,
               rc.rol AS rol_cluster
        FROM socios s
        LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
        JOIN consentimientos c ON c.socio_id = s.id
        WHERE s.estado = 'aprobado' AND s.activo = true
          AND s.id <> $1
          AND c.acepta_visibilidad_datos = true
          AND ($2::text IS NULL OR s.provincia = $2)
        ORDER BY s.fecha_registro DESC
        LIMIT 5
      `, [socioId, yo ? yo.provincia : null]);

      const b2bOfrece = await db.query(`
        SELECT s.id, s.nombre, s.apellidos, s.entidad, s.provincia,
               s.foto_url, rc.rol AS rol_cluster
        FROM socios s
        JOIN rol_cluster rc ON rc.socio_id = s.id
        JOIN consentimientos c ON c.socio_id = s.id
        WHERE s.estado = 'aprobado' AND s.activo = true
          AND s.id <> $1
          AND c.acepta_visibilidad_datos = true
          AND rc.b2b_ofrece = true
        ORDER BY s.fecha_registro DESC
        LIMIT 5
      `, [socioId]);

      const b2bBusca = await db.query(`
        SELECT s.id, s.nombre, s.apellidos, s.entidad, s.provincia,
               s.foto_url, rc.rol AS rol_cluster
        FROM socios s
        JOIN rol_cluster rc ON rc.socio_id = s.id
        JOIN consentimientos c ON c.socio_id = s.id
        WHERE s.estado = 'aprobado' AND s.activo = true
          AND s.id <> $1
          AND c.acepta_visibilidad_datos = true
          AND rc.b2b_busca = true
        ORDER BY s.fecha_registro DESC
        LIMIT 5
      `, [socioId]);

      res.json({
        provincia_referencia: yo ? yo.provincia : null,
        altas_cerca: cerca.rows,
        b2b_ofrece: b2bOfrece.rows,
        b2b_busca: b2bBusca.rows,
      });
    } catch (error) {
      console.error('Error feed:', error);
      res.status(500).json({ error: 'No se pudo cargar el feed' });
    }
  }

  // ==================== PERFIL INDIVIDUAL ====================

  async getPerfil(req, res) {
    try {
      const { socioId } = req.params;
      const viewerId = req.socioId || req.adminId;
      const isAdmin = !!req.adminId;

      // Verificar si puede ver este perfil
      if (!isAdmin && !(await canViewSocio(viewerId, parseInt(socioId)))) {
        return res.status(403).json({ 
          error: 'No tienes permisos para ver este perfil' 
        });
      }

      const result = await db.query(
        'SELECT * FROM vista_socios_completos WHERE id = $1',
        [socioId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Socio no encontrado' });
      }

      const socio = result.rows[0];
      const isOwner = socio.id === req.socioId;

      // La vista histórica no incluye esta preferencia. Recuperarla para
      // el propietario evita que la UI desmarque y sobrescriba su elección.
      if (isOwner || isAdmin) {
        const consentimientos = await db.findOne('consentimientos', { socio_id: socio.id });
        socio.acepta_mapa_interactivo = !!(consentimientos && (consentimientos.mapa_visible ?? consentimientos.acepta_mapa_interactivo));
        socio.acepta_notificaciones_email = !!(consentimientos && consentimientos.acepta_notificaciones_email);
      }

      // DNI sólo se descifra para owner/admin.
      if ((isOwner || isAdmin) && socio.dni_nie_encrypted) {
        socio.dni_nie = decryptData(socio.dni_nie_encrypted);
      }
      // Teléfono se descifra siempre; filterSensitiveData decide visibilidad
      // según el consentimiento `visible_telefono`.
      if (socio.telefono_encrypted) {
        socio.telefono = decryptData(socio.telefono_encrypted);
      }

      if (socio.telefono_personal_encrypted) socio.telefono_personal = decryptData(socio.telefono_personal_encrypted);
      const perfilFiltrado = filterSensitiveData(socio, isOwner, isAdmin);
      if (socio.cv_url && await require('../services/cvAccess').canRead(req, socio.id)) perfilFiltrado.cv_url = socio.cv_url;
      if (isOwner || isAdmin) perfilFiltrado.ubicacion_estado = socio.latitud != null && socio.longitud != null ? 'municipio' : (geocodingService.getProvinciaCoords(socio.provincia) ? 'provincia' : 'pendiente');

      // Auditar visualización de perfil
      await auditAction(req.socioId, req.adminId, 'VIEW_PROFILE', 'socios', null, { 
        viewed_socio_id: socioId 
      }, req);

      res.json({ socio: perfilFiltrado });

    } catch (error) {
      console.error('Error en getPerfil:', error);
      res.status(500).json({ error: 'Error obteniendo perfil' });
    }
  }

  // ==================== ACTUALIZAR PERFIL PROPIO ====================
  
  async updatePerfil(req, res) {
    try {
      const socioId = req.socioId; // Solo el propio socio puede actualizar
      const datosAnteriores = await db.findOne('socios', { id: socioId });
      
      if (!datosAnteriores) {
        return res.status(404).json({ error: 'Socio no encontrado' });
      }

      const {
        nombre, apellidos, dni_nie, telefono, linkedin_url, otras_redes,
        entidad, web_profesional, provincia, comunidad_autonoma, localidad, codigo_postal,
        direccion_completa, ambito, cargo_actual, anos_experiencia, sexo,

        // v2: campos nuevos
        tipo_socio, email_personal, email_preferido, nombre_organizacion,

        // Rol cluster
        rol_cluster, b2b_ofrece, b2b_busca, b2b_licita,

        // Especialidades
        especialidades,

        // Disponibilidad
        disponibilidad, ponente, tutor_mentor, asistente,
        congreso_almeria, representacion, captacion_patrocinio,

        // Proyecto innovación
        proyecto_descripcion, proyecto_tecnologias, proyecto_impacto,

        // Consentimientos
        acepta_mensajeria, acepta_notificaciones_email,
        visible_telefono, visible_email_directo, visible_web_profesional, visible_linkedin
      } = req.body;

      await db.transaction(async (client) => {
        
        // 1. Actualizar datos principales del socio
        const socioUpdate = {};
        
        if (nombre !== undefined) socioUpdate.nombre = nombre;
        if (apellidos !== undefined) socioUpdate.apellidos = apellidos;
        if (dni_nie !== undefined) socioUpdate.dni_nie_encrypted = dni_nie ? encryptData(dni_nie) : null;
        if (telefono !== undefined) {
          socioUpdate.telefono_encrypted = telefono ? encryptData(telefono) : null;
        }
        if (linkedin_url !== undefined) socioUpdate.linkedin_url = linkedin_url;
        if (otras_redes !== undefined) socioUpdate.otras_redes = otras_redes;
        if (entidad !== undefined) socioUpdate.entidad = entidad;
        if (req.body.sector !== undefined) socioUpdate.sector = req.body.sector || null;
        if (req.body.telefono_personal !== undefined) socioUpdate.telefono_personal_encrypted = req.body.telefono_personal ? encryptData(req.body.telefono_personal) : null;
        if (web_profesional !== undefined) socioUpdate.web_profesional = web_profesional;
        if (provincia !== undefined) {
          socioUpdate.provincia = provincia;
          // Si no nos pasan CCAA explícita, inferimos por la provincia
          if (comunidad_autonoma === undefined && provincia) {
            const ca = catalogos.findCcaaByProvincia(provincia);
            if (ca) socioUpdate.comunidad_autonoma = ca.slug;
          }
        }
        if (comunidad_autonoma !== undefined) socioUpdate.comunidad_autonoma = comunidad_autonoma;
        if (localidad !== undefined) socioUpdate.localidad = localidad;
        if (codigo_postal !== undefined) socioUpdate.codigo_postal = codigo_postal;
        if (direccion_completa !== undefined) socioUpdate.direccion_completa = direccion_completa;
        if (ambito !== undefined) socioUpdate.ambito = ambito;
        if (cargo_actual !== undefined) socioUpdate.cargo_actual = cargo_actual;
        if (anos_experiencia !== undefined) socioUpdate.anos_experiencia = anos_experiencia == null ? null : parseInt(anos_experiencia);
        if (sexo !== undefined) {
          // Sólo aceptamos los valores del catálogo (evita inyección de cualquier string).
          socioUpdate.sexo = ['femenino','masculino'].includes(sexo) ? sexo : null;
        }

        // v2: nuevos campos del perfil
        if (tipo_socio !== undefined && tipo_socio !== datosAnteriores.tipo_socio) {
          const error = new Error('Solicita a administración el cambio de tipo de socio'); error.status=403; throw error;
        }
        if (email_personal !== undefined) socioUpdate.email_personal = email_personal;
        if (email_preferido !== undefined) socioUpdate.email_preferido = email_preferido;
        if (nombre_organizacion !== undefined) socioUpdate.nombre_organizacion = nombre_organizacion;

        // Geocoding por municipio.
        // Cambiamos la precisión: en lugar de geocodificar la dirección
        // exacta del socio (que sería PII innecesaria en el mapa),
        // usamos `localidad + provincia, España` — precisión municipio.
        // Esto encaja con lo prometido en el formulario de alta
        // ("ubicación profesional a nivel de municipio").
        // Se dispara si cambia localidad o provincia.
        const nuevaLocalidad = localidad !== undefined ? localidad : datosAnteriores.localidad;
        const nuevaProvincia = provincia !== undefined ? provincia : datosAnteriores.provincia;
        const cambioUbicacion =
          (localidad !== undefined && localidad !== datosAnteriores.localidad) ||
          (provincia !== undefined && provincia !== datosAnteriores.provincia);
        if (cambioUbicacion) { socioUpdate.latitud = null; socioUpdate.longitud = null; }
        const faltanCoords = datosAnteriores.latitud == null || datosAnteriores.longitud == null;
        if ((cambioUbicacion || faltanCoords) && nuevaLocalidad && nuevaProvincia) {
          try {
            const coords = await geocodingService.geocode(
              `${nuevaLocalidad}, ${nuevaProvincia}, España`
            );
            if (coords) {
              socioUpdate.latitud = coords.lat;
              socioUpdate.longitud = coords.lng;
            }
          } catch (geoError) {
            console.warn('[geocode] updatePerfil: municipio no localizable:', geoError.message);
          }
        }

        if (Object.keys(socioUpdate).length > 0) {
          await client.query(`
            UPDATE socios SET ${Object.keys(socioUpdate).map((key, i) => `${key} = $${i + 2}`).join(', ')}
            WHERE id = $1
          `, [socioId, ...Object.values(socioUpdate)]);
        }

        // Preserve the secondary role and B2B choices on partial updates.
        if (rol_cluster !== undefined || req.body.rol_secundario !== undefined || b2b_ofrece !== undefined || b2b_busca !== undefined || b2b_licita !== undefined) {
          const previous = (await client.query('SELECT * FROM rol_cluster WHERE socio_id=$1', [socioId])).rows[0] || {};
          const primary = rol_cluster === undefined ? previous.rol : rol_cluster;
          const secondary = req.body.rol_secundario === undefined ? previous.rol_secundario : req.body.rol_secundario;
          if (!primary && (b2b_ofrece || b2b_busca || b2b_licita)) { const error=new Error('Selecciona un rol principal para guardar intereses B2B'); error.status=400; throw error; }
          if (secondary && (!primary || primary === secondary)) {
            const error = new Error('Selecciona dos roles distintos y un rol principal'); error.status = 400; throw error;
          }
          await client.query('DELETE FROM rol_cluster WHERE socio_id=$1', [socioId]);
          if (primary) await client.query(`INSERT INTO rol_cluster (socio_id,rol,rol_secundario,b2b_ofrece,b2b_busca,b2b_licita)
            VALUES ($1,$2,$3,$4,$5,$6)`, [socioId,primary,secondary || null,
            b2b_ofrece === undefined ? !!previous.b2b_ofrece : !!b2b_ofrece,
            b2b_busca === undefined ? !!previous.b2b_busca : !!b2b_busca,
            b2b_licita === undefined ? !!previous.b2b_licita : !!b2b_licita]);
        }

        // 3. Actualizar especialidades
        if (especialidades && Array.isArray(especialidades)) {
          await client.query('DELETE FROM socio_especialidades WHERE socio_id = $1', [socioId]);
          for (let i = 0; i < especialidades.length; i++) {
            await client.query(`
              INSERT INTO socio_especialidades (socio_id, especialidad, orden_prioridad)
              VALUES ($1, $2, $3)
            `, [socioId, especialidades[i], i + 1]);
          }
        }

        // 4. Actualizar disponibilidad
        if (disponibilidad !== undefined) {
          await client.query('DELETE FROM disponibilidad WHERE socio_id = $1', [socioId]);
          if (disponibilidad) {
            await client.query(`
              INSERT INTO disponibilidad (
                socio_id, nivel, ponente, tutor_mentor, asistente,
                congreso_almeria, representacion, captacion_patrocinio
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              socioId, disponibilidad, !!ponente, !!tutor_mentor, !!asistente,
              !!congreso_almeria, !!representacion, !!captacion_patrocinio
            ]);
          }
        }

        // 5. Actualizar proyecto de innovación
        if (proyecto_descripcion !== undefined) {
          await client.query('DELETE FROM proyectos_innovacion WHERE socio_id = $1', [socioId]);
          if (proyecto_descripcion) {
            await client.query(`
              INSERT INTO proyectos_innovacion (socio_id, descripcion, tecnologias, impacto)
              VALUES ($1, $2, $3, $4)
            `, [socioId, proyecto_descripcion, proyecto_tecnologias, proyecto_impacto]);
          }
        }

        // 6. Actualizar consentimientos
        const consentimientoUpdate = {};
        for (const key of ['acepta_mapa_interactivo','acepta_visibilidad_datos']) {
          if (req.body[key] !== undefined) consentimientoUpdate[key] = req.body[key];
        }
        if (req.body.acepta_mapa_interactivo !== undefined) {
          if (typeof req.body.acepta_mapa_interactivo !== 'boolean') {const error=new Error('La visibilidad del mapa debe ser verdadera o falsa');error.status=400;throw error;}
          consentimientoUpdate.mapa_visible = req.body.acepta_mapa_interactivo;
        }
        if (acepta_mensajeria !== undefined) consentimientoUpdate.acepta_mensajeria = acepta_mensajeria;
        if (acepta_notificaciones_email !== undefined) consentimientoUpdate.acepta_notificaciones_email = acepta_notificaciones_email;
        if (visible_telefono !== undefined) consentimientoUpdate.visible_telefono = visible_telefono;
        if (req.body.visible_telefono_personal !== undefined) consentimientoUpdate.visible_telefono_personal = !!req.body.visible_telefono_personal;
        if (visible_email_directo !== undefined) consentimientoUpdate.visible_email_directo = visible_email_directo;
        if (visible_web_profesional !== undefined) consentimientoUpdate.visible_web_profesional = visible_web_profesional;
        if (visible_linkedin !== undefined) consentimientoUpdate.visible_linkedin = visible_linkedin;

        if (Object.keys(consentimientoUpdate).length > 0) {
          // Las cuentas importadas antiguas pueden no tener esta fila.
          // No conceder visibilidad ni mensajería sin elección del socio.
          await client.query(`
            INSERT INTO consentimientos (socio_id, acepta_mensajeria,
              acepta_notificaciones_email, visible_web_profesional, visible_linkedin)
            VALUES ($1, false, false, false, false)
            ON CONFLICT (socio_id) DO NOTHING
          `, [socioId]);
          await client.query(`
            UPDATE consentimientos SET ${Object.keys(consentimientoUpdate).map((key, i) => `${key} = $${i + 2}`).join(', ')}
            WHERE socio_id = $1
          `, [socioId, ...Object.values(consentimientoUpdate)]);
        }
      });

      // Obtener datos actualizados
      const socioActualizado = await db.query(
        'SELECT * FROM vista_socios_completos WHERE id = $1',
        [socioId]
      );

      // Auditar actualización
      const auditedChanges = { ...req.body };
      for (const key of ['telefono','telefono_personal','dni_nie','password']) {
        if (key in auditedChanges) auditedChanges[key] = '[dato privado actualizado]';
      }
      await auditAction(socioId, null, 'UPDATE_PROFILE', 'socios', datosAnteriores, auditedChanges, req);

      res.json({ 
        message: 'Perfil actualizado correctamente',
        socio: filterSensitiveData(socioActualizado.rows[0], true, false)
      });

    } catch (error) {
      if ([400,403].includes(error.status)) return res.status(error.status).json({ error: error.message });
      console.error('Error actualizando perfil:', error);
      res.status(500).json({ error: 'Error actualizando perfil' });
    }
  }

  // ==================== BÚSQUEDA GEOGRÁFICA ====================
  
  async buscarCerca(req, res) {
    try {
      const { lat, lng, radio = 50 } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({ 
          error: 'Coordenadas lat y lng son requeridas' 
        });
      }

      const latitude = parseFloat(lat);
      const longitude = parseFloat(lng);
      const radiusKm = Math.min(parseInt(radio), 200); // Máximo 200km

      if (!geocodingService.isValidSpanishCoords(latitude, longitude)) {
        return res.status(400).json({ 
          error: 'Coordenadas fuera del territorio español' 
        });
      }

      const filters = {
        provincia: req.query.provincia,
        rol_cluster: req.query.rol_cluster,
        especialidad: req.query.especialidad
      };

      const socios = await sociosQueries.findNearby(latitude, longitude, radiusKm, filters);

      const sociosFiltrados = socios.map(socio => {
        const isOwner = socio.id === req.socioId;
        const isAdmin = !!req.adminId;
        if (socio.telefono_personal_encrypted) socio.telefono_personal = decryptData(socio.telefono_personal_encrypted);
        return filterSensitiveData(socio, isOwner, isAdmin);
      });

      // Auditar búsqueda geográfica
      await auditAction(req.socioId, req.adminId, 'GEOGRAPHIC_SEARCH', 'socios', null, { 
        lat: latitude, lng: longitude, radio: radiusKm, results: socios.length 
      }, req);

      res.json({
        socios: sociosFiltrados,
        center: { lat: latitude, lng: longitude },
        radius: radiusKm,
        total: socios.length
      });

    } catch (error) {
      console.error('Error en búsqueda geográfica:', error);
      res.status(500).json({ error: 'Error en búsqueda geográfica' });
    }
  }

  // ==================== ESTADÍSTICAS OBSERVATORIO ====================
  
  async getObservatorioStats(req, res) {
    try {
      // Obtener configuración de KPIs activos
      const config = await db.findOne('configuracion', { clave: 'dashboard_kpis_activos' });
      const kpisActivos = config ? JSON.parse(config.valor) : ['total_socios', 'provincias_activas', 'mentores_disponibles', 'proyectos_b2b'];

      // Estadísticas básicas
      const stats = await db.getObservatorioStats();

      // Distribución por provincias
      const provinciasDist = await db.query(`
        SELECT provincia, COUNT(*) as total
        FROM vista_socios_completos 
        GROUP BY provincia 
        ORDER BY total DESC
      `);

      // Distribución por roles cluster
      const rolesDist = await db.query(`
        SELECT rol_cluster, COUNT(*) as total
        FROM (SELECT unnest(ARRAY[rol_cluster,rol_secundario]) AS rol_cluster FROM vista_socios_completos) roles
        WHERE rol_cluster IS NOT NULL
        GROUP BY rol_cluster 
        ORDER BY total DESC
      `);

      // Top especialidades (cantidad configurable)
      const topConfig = await db.findOne('configuracion', { clave: 'top_especialidades_cantidad' });
      const topCantidad = topConfig ? parseInt(topConfig.valor) : 6;

      const especialidadesDist = await db.query(`
        SELECT especialidad, COUNT(*) as total
        FROM (
          SELECT unnest(especialidades) as especialidad
          FROM vista_socios_completos
          WHERE especialidades IS NOT NULL
        ) t
        GROUP BY especialidad 
        ORDER BY total DESC 
        LIMIT $1
      `, [topCantidad]);

      // Disponibilidad para mentoring/ponencias
      const disponibilidadDist = await db.query(`
        SELECT disponibilidad, COUNT(*) as total
        FROM vista_socios_completos 
        WHERE disponibilidad IS NOT NULL
        GROUP BY disponibilidad 
        ORDER BY 
          CASE disponibilidad 
            WHEN 'Alta' THEN 1 
            WHEN 'Media' THEN 2 
            WHEN 'Puntual' THEN 3 
          END
      `);

      // Auditar acceso al observatorio
      await auditAction(req.socioId, req.adminId, 'VIEW_OBSERVATORY', 'observatorio', null, null, req);

      res.json({
        kpis: {
          total_socios: kpisActivos.includes('total_socios') ? stats.total_socios : null,
          provincias_activas: kpisActivos.includes('provincias_activas') ? stats.provincias_activas : null,
          mentores_disponibles: kpisActivos.includes('mentores_disponibles') ? stats.mentores_disponibles : null,
          proyectos_b2b: kpisActivos.includes('proyectos_b2b') ? stats.proyectos_b2b : null,
          socios_pendientes: req.adminId ? stats.socios_pendientes_aprobacion : null // Solo para admins
        },
        charts: {
          distribucion_provincias: provinciasDist.rows,
          roles_cluster: rolesDist.rows,
          top_especialidades: especialidadesDist.rows,
          disponibilidad: disponibilidadDist.rows
        },
        config: {
          top_especialidades_cantidad: topCantidad,
          kpis_activos: kpisActivos
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error en observatorio stats:', error);
      res.status(500).json({ error: 'Error obteniendo estadísticas del observatorio' });
    }
  }

  // ==================== EXPORTAR DATOS (RGPD) ====================
  
  async exportarDatosPersonales(req, res) {
    try {
      const socioId = req.socioId;

      // Obtener todos los datos del socio
      const socio = await db.query(`
        SELECT s.*, rc.*, d.*, c.*, 
               array_agg(DISTINCT se.especialidad) as especialidades,
               array_agg(DISTINCT pi.descripcion) as proyectos
        FROM socios s
        LEFT JOIN rol_cluster rc ON s.id = rc.socio_id
        LEFT JOIN disponibilidad d ON s.id = d.socio_id  
        LEFT JOIN consentimientos c ON s.id = c.socio_id
        LEFT JOIN socio_especialidades se ON s.id = se.socio_id
        LEFT JOIN proyectos_innovacion pi ON s.id = pi.socio_id
        WHERE s.id = $1
        GROUP BY s.id, rc.id, d.id, c.id
      `, [socioId]);

      if (socio.rows.length === 0) {
        return res.status(404).json({ error: 'Datos no encontrados' });
      }

      const datos = socio.rows[0];
      
      // Descifrar datos sensibles
      if (datos.dni_nie_encrypted) {
        datos.dni_nie = decryptData(datos.dni_nie_encrypted);
        delete datos.dni_nie_encrypted;
      }
      if (datos.telefono_encrypted) {
        datos.telefono = decryptData(datos.telefono_encrypted);
        delete datos.telefono_encrypted;
      }
      // Higiene RGPD: nunca exponer el hash de la contraseña ni tokens
      // internos aunque estén cifrados/hasheados. El derecho de portabilidad
      // cubre los datos personales, no los credenciales técnicos.
      if (datos.telefono_personal_encrypted) datos.telefono_personal = decryptData(datos.telefono_personal_encrypted);
      delete datos.telefono_personal_encrypted;
      delete datos.password_hash;
      delete datos.notas_moderacion;
      delete datos.moderado_por;

      // Obtener historial de mensajes
      const mensajes = await db.query(`
        SELECT m.contenido, m.created_at,
               e.nombre as emisor_nombre, r.nombre as receptor_nombre
        FROM mensajes m
        JOIN socios e ON m.emisor_id = e.id
        JOIN socios r ON m.receptor_id = r.id
        WHERE m.emisor_id = $1 OR m.receptor_id = $1
        ORDER BY m.created_at DESC
      `, [socioId]);

      // Obtener logs de auditoría
      const auditoria = await db.query(`
        SELECT accion, recurso, created_at, ip_address
        FROM auditoria 
        WHERE socio_id = $1
        ORDER BY created_at DESC
        LIMIT 100
      `, [socioId]);

      const exportData = {
        datos_personales: datos,
        mensajes: mensajes.rows,
        historial_acceso: auditoria.rows,
        fecha_exportacion: new Date().toISOString(),
        notas: 'Exportación de datos personales según RGPD Art. 20'
      };

      // Auditar exportación
      await auditAction(socioId, null, 'EXPORT_PERSONAL_DATA', 'rgpd', null, null, req);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="datos_personales_agesport_${socioId}.json"`);
      res.json(exportData);

    } catch (error) {
      console.error('Error exportando datos:', error);
      res.status(500).json({ error: 'Error exportando datos personales' });
    }
  }

  // ==================== ELIMINAR CUENTA (RGPD) ====================
  
  async eliminarCuenta(req, res) {
    try {
      const socioId = req.socioId;
      const { confirmacion } = req.body;

      if (confirmacion !== 'CONFIRMO_ELIMINACION') {
        return res.status(400).json({ 
          error: 'Debes confirmar la eliminación con el texto exacto: CONFIRMO_ELIMINACION' 
        });
      }

      // Obtener datos antes de eliminar para auditoría
      const socioData = await db.findOne('socios', { id: socioId });

      await db.transaction(async (client) => {
        // Eliminar en cascada (definido en schema)
        await client.query('DELETE FROM socios WHERE id = $1', [socioId]);
        
        // Anonimizar mensajes en lugar de eliminarlos (para mantener conversaciones)
        await client.query(`
          UPDATE mensajes 
          SET contenido = '[Mensaje eliminado - usuario dio de baja]'
          WHERE emisor_id = $1
        `, [socioId]);
      });

      // Auditar eliminación (con socio_id null porque ya no existe)
      await auditAction(null, null, 'DELETE_ACCOUNT', 'socios', socioData, null, req);

      // Limpiar sesión
      res.clearCookie('token');
      res.clearCookie('refreshToken');

      res.json({ 
        message: 'Cuenta eliminada permanentemente. Todos tus datos han sido borrados.',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error eliminando cuenta:', error);
      res.status(500).json({ error: 'Error eliminando cuenta' });
    }
  }
  // ==================== SUBIR FOTO DE PERFIL ====================

  async uploadFoto(req, res) {
    try {
      const socioId = req.socioId;
      if (!req.file) {
        return res.status(400).json({ error: 'No se ha recibido ningún fichero' });
      }

      // Obtener foto antigua para borrarla después
      const previo = await db.findOne('socios', { id: socioId }, 'foto_url');
      const nuevaUrl = uploadService.toPublicUrl('fotos', req.file.filename);

      await db.update('socios', { foto_url: nuevaUrl }, { id: socioId });

      if (previo && previo.foto_url) uploadService.removeFile(previo.foto_url);

      await auditAction(socioId, null, 'UPLOAD_PHOTO', 'socios', null, { foto_url: nuevaUrl }, req);
      res.json({ message: 'Foto actualizada', foto_url: nuevaUrl });
    } catch (error) {
      console.error('Error subiendo foto:', error);
      res.status(500).json({ error: 'Error subiendo foto' });
    }
  }

  // ==================== SUBIR CV ====================

  async uploadCV(req, res) {
    try {
      const socioId = req.socioId;
      if (!req.file) {
        return res.status(400).json({ error: 'No se ha recibido ningún fichero' });
      }

      const previo = await db.findOne('socios', { id: socioId }, 'cv_url');
      const nuevaUrl = uploadService.toPublicUrl('cvs', req.file.filename);

      await db.update('socios', { cv_url: nuevaUrl }, { id: socioId });

      if (previo && previo.cv_url) uploadService.removeFile(previo.cv_url);

      await auditAction(socioId, null, 'UPLOAD_CV', 'socios', null, { cv_url: nuevaUrl }, req);
      res.json({ message: 'CV actualizado', cv_url: nuevaUrl });
    } catch (error) {
      console.error('Error subiendo CV:', error);
      res.status(500).json({ error: 'Error subiendo CV' });
    }
  }

  // ==================== ELIMINAR CV ====================

  async deleteCV(req, res) {
    try {
      const socioId = req.socioId;
      const previo = await db.findOne('socios', { id: socioId }, 'cv_url');
      if (previo && previo.cv_url) uploadService.removeFile(previo.cv_url);
      await db.update('socios', { cv_url: null }, { id: socioId });
      await auditAction(socioId, null, 'DELETE_CV', 'socios', previo, null, req);
      res.json({ message: 'CV eliminado' });
    } catch (error) {
      console.error('Error eliminando CV:', error);
      res.status(500).json({ error: 'Error eliminando CV' });
    }
  }

  // ==================== SOLICITAR BAJA ====================

  async solicitarBaja(req, res) {
    try {
      const socioId = req.socioId;
      const { motivo } = req.body;

      // Verificar que no haya ya una baja pendiente
      const existente = await db.findOne('bajas_pendientes', { socio_id: socioId, estado: 'pendiente' });
      if (existente) {
        return res.status(409).json({ error: 'Ya tienes una solicitud de baja pendiente' });
      }

      await db.insert('bajas_pendientes', {
        socio_id: socioId,
        motivo: motivo || null,
        estado: 'pendiente'
      });

      await auditAction(socioId, null, 'REQUEST_UNSUBSCRIBE', 'bajas_pendientes', null, { motivo }, req);
      res.status(201).json({
        message: 'Solicitud de baja registrada. Te contactaremos para confirmarla.'
      });
    } catch (error) {
      console.error('Error solicitando baja:', error);
      res.status(500).json({ error: 'Error solicitando baja' });
    }
  }
}

module.exports = new SociosController();
