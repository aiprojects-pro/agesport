// controllers/sociosController.js
const db = require('../config/database');
const { 
  filterSensitiveData, 
  canViewSocio, 
  auditAction, 
  encryptData, 
  decryptData 
} = require('../middleware/auth');
const geocodingService = require('../services/geocodingService');

class SociosController {

  // ==================== DIRECTORIO PÚBLICO (solo socios autenticados) ====================
  
  async getDirectorio(req, res) {
    try {
      const {
        search = '',
        provincia = '',
        rol_cluster = '',
        especialidad = '',
        disponibilidad = '',
        anos_experiencia_min = '',
        b2b_ofrece = '',
        b2b_busca = '',
        b2b_licita = '',
        page = 1,
        limit = 20
      } = req.query;

      let socios;
      
      // Si hay término de búsqueda, usar búsqueda full-text
      if (search.trim()) {
        const filters = {
          provincia: provincia || undefined,
          rol_cluster: rol_cluster || undefined,
          disponibilidad: disponibilidad || undefined,
          anos_experiencia_min: anos_experiencia_min ? parseInt(anos_experiencia_min) : undefined
        };
        
        // Filtrar valores vacíos
        Object.keys(filters).forEach(key => 
          filters[key] === undefined && delete filters[key]
        );

        socios = await db.searchSocios(search, filters);
      } else {
        // Construir query con filtros
        let query = 'SELECT * FROM vista_socios_completos WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (provincia) {
          query += ` AND provincia = $${paramIndex}`;
          params.push(provincia);
          paramIndex++;
        }

        if (rol_cluster) {
          query += ` AND rol_cluster = $${paramIndex}`;
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

        // Paginación
        const offset = (page - 1) * limit;
        query += ` ORDER BY nombre, apellidos LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), offset);

        const result = await db.query(query, params);
        socios = result.rows;
      }

      // Filtrar datos sensibles según permisos del viewer
      const sociosFiltrados = socios.map(socio => {
        const isOwner = socio.id === req.socioId;
        const isAdmin = !!req.adminId;
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
      
      // Descifrar datos sensibles si es el propietario o admin
      if (isOwner || isAdmin) {
        if (socio.dni_nie_encrypted) {
          socio.dni_nie = decryptData(socio.dni_nie_encrypted);
        }
        if (socio.telefono_encrypted) {
          socio.telefono = decryptData(socio.telefono_encrypted);
        }
      }

      const perfilFiltrado = filterSensitiveData(socio, isOwner, isAdmin);

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
        tipo_socio, tipo_corporativo, entidad, web_profesional, provincia, localidad, codigo_postal,
        direccion_completa, ambito, cargo_actual, anos_experiencia,
        bio_profesional,
        
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
        if (telefono !== undefined) socioUpdate.telefono_encrypted = telefono ? encryptData(telefono) : null;
        if (linkedin_url !== undefined) socioUpdate.linkedin_url = linkedin_url;
        if (otras_redes !== undefined) socioUpdate.otras_redes = otras_redes;
        if (tipo_socio !== undefined) socioUpdate.tipo_socio = tipo_socio;
        if (tipo_corporativo !== undefined) socioUpdate.tipo_corporativo = tipo_corporativo;
        if (entidad !== undefined) socioUpdate.entidad = entidad;
        if (web_profesional !== undefined) socioUpdate.web_profesional = web_profesional;
        if (provincia !== undefined) socioUpdate.provincia = provincia;
        if (localidad !== undefined) socioUpdate.localidad = localidad;
        if (codigo_postal !== undefined) socioUpdate.codigo_postal = codigo_postal;
        if (direccion_completa !== undefined) socioUpdate.direccion_completa = direccion_completa;
        if (ambito !== undefined) socioUpdate.ambito = ambito;
        if (cargo_actual !== undefined) socioUpdate.cargo_actual = cargo_actual;
        if (anos_experiencia !== undefined) socioUpdate.anos_experiencia = parseInt(anos_experiencia);
        if (bio_profesional !== undefined) socioUpdate.bio_profesional = bio_profesional;

        // Regeocoding si cambió la dirección
        if (direccion_completa && (direccion_completa !== datosAnteriores.direccion_completa)) {
          try {
            const coords = await geocodingService.geocode(
              `${direccion_completa}, ${localidad || datosAnteriores.localidad}, ${provincia || datosAnteriores.provincia}, España`
            );
            if (coords) {
              socioUpdate.latitud = coords.lat;
              socioUpdate.longitud = coords.lng;
            }
          } catch (geoError) {
            console.log('Advertencia geocoding:', geoError.message);
          }
        }

        if (Object.keys(socioUpdate).length > 0) {
          await client.query(`
            UPDATE socios SET ${Object.keys(socioUpdate).map((key, i) => `${key} = $${i + 2}`).join(', ')}
            WHERE id = $1
          `, [socioId, ...Object.values(socioUpdate)]);
        }

        // 2. Actualizar rol cluster
        if (rol_cluster !== undefined || b2b_ofrece !== undefined || b2b_busca !== undefined || b2b_licita !== undefined) {
          const rolActual = await client.query('SELECT * FROM rol_cluster WHERE socio_id = $1 LIMIT 1', [socioId]);
          const rolEfectivo = rol_cluster !== undefined
            ? rol_cluster
            : (rolActual.rows[0] ? rolActual.rows[0].rol : null);

          await client.query('DELETE FROM rol_cluster WHERE socio_id = $1', [socioId]);
          if (rolEfectivo) {
            await client.query(`
              INSERT INTO rol_cluster (socio_id, rol, b2b_ofrece, b2b_busca, b2b_licita)
              VALUES ($1, $2, $3, $4, $5)
            `, [
              socioId,
              rolEfectivo,
              b2b_ofrece !== undefined ? !!b2b_ofrece : !!(rolActual.rows[0] && rolActual.rows[0].b2b_ofrece),
              b2b_busca !== undefined ? !!b2b_busca : !!(rolActual.rows[0] && rolActual.rows[0].b2b_busca),
              b2b_licita !== undefined ? !!b2b_licita : !!(rolActual.rows[0] && rolActual.rows[0].b2b_licita)
            ]);
          }
        }

        // 3. Actualizar especialidades
        if (especialidades && Array.isArray(especialidades)) {
          await client.query('DELETE FROM socio_especialidades WHERE socio_id = $1', [socioId]);
          for (let i = 0; i < Math.min(especialidades.length, 3); i++) {
            await client.query(`
              INSERT INTO socio_especialidades (socio_id, especialidad, orden_prioridad)
              VALUES ($1, $2, $3)
            `, [socioId, especialidades[i], i + 1]);
          }
        }

        // 4. Actualizar disponibilidad
        if (
          disponibilidad !== undefined ||
          ponente !== undefined ||
          tutor_mentor !== undefined ||
          asistente !== undefined ||
          congreso_almeria !== undefined ||
          representacion !== undefined ||
          captacion_patrocinio !== undefined
        ) {
          const disponibilidadActual = await client.query('SELECT * FROM disponibilidad WHERE socio_id = $1 LIMIT 1', [socioId]);
          const nivelEfectivo = disponibilidad !== undefined
            ? disponibilidad
            : (disponibilidadActual.rows[0] ? disponibilidadActual.rows[0].nivel : null);

          await client.query('DELETE FROM disponibilidad WHERE socio_id = $1', [socioId]);
          if (nivelEfectivo) {
            await client.query(`
              INSERT INTO disponibilidad (
                socio_id, nivel, ponente, tutor_mentor, asistente,
                congreso_almeria, representacion, captacion_patrocinio
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [
              socioId,
              nivelEfectivo,
              ponente !== undefined ? !!ponente : !!(disponibilidadActual.rows[0] && disponibilidadActual.rows[0].ponente),
              tutor_mentor !== undefined ? !!tutor_mentor : !!(disponibilidadActual.rows[0] && disponibilidadActual.rows[0].tutor_mentor),
              asistente !== undefined ? !!asistente : !!(disponibilidadActual.rows[0] && disponibilidadActual.rows[0].asistente),
              congreso_almeria !== undefined ? !!congreso_almeria : !!(disponibilidadActual.rows[0] && disponibilidadActual.rows[0].congreso_almeria),
              representacion !== undefined ? !!representacion : !!(disponibilidadActual.rows[0] && disponibilidadActual.rows[0].representacion),
              captacion_patrocinio !== undefined ? !!captacion_patrocinio : !!(disponibilidadActual.rows[0] && disponibilidadActual.rows[0].captacion_patrocinio)
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
        if (acepta_mensajeria !== undefined) consentimientoUpdate.acepta_mensajeria = acepta_mensajeria;
        if (acepta_notificaciones_email !== undefined) consentimientoUpdate.acepta_notificaciones_email = acepta_notificaciones_email;
        if (visible_telefono !== undefined) consentimientoUpdate.visible_telefono = visible_telefono;
        if (visible_email_directo !== undefined) consentimientoUpdate.visible_email_directo = visible_email_directo;
        if (visible_web_profesional !== undefined) consentimientoUpdate.visible_web_profesional = visible_web_profesional;
        if (visible_linkedin !== undefined) consentimientoUpdate.visible_linkedin = visible_linkedin;

        if (Object.keys(consentimientoUpdate).length > 0) {
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
      await auditAction(socioId, null, 'UPDATE_PROFILE', 'socios', datosAnteriores, req.body, req);

      res.json({ 
        message: 'Perfil actualizado correctamente',
        socio: filterSensitiveData(socioActualizado.rows[0], true, false)
      });

    } catch (error) {
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

      const socios = await db.findNearby(latitude, longitude, radiusKm, filters);

      const sociosFiltrados = socios.map(socio => {
        const isOwner = socio.id === req.socioId;
        const isAdmin = !!req.adminId;
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
        FROM vista_socios_completos 
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
}

module.exports = new SociosController();
