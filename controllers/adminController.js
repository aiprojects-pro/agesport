// controllers/adminController.js
const db = require('../config/database');
const { auditAction, hashPassword, encryptData, decryptData } = require('../middleware/auth');
const emailService = require('../services/emailService');
const uploadService = require('../services/uploadService');
const geocodingService = require('../services/geocodingService');
const csv = require('../services/csv');
const catalogos = require('../config/catalogos');
const crypto = require('crypto');

// Helper para comunicaciones masivas: construye WHERE + params a partir de
// un objeto de filtros. Función libre (no método) para evitar problemas de
// binding de `this` al pasarla como handler de Express.
function buildSocioFilterWhere(f) {
  const wh = ["s.estado='aprobado'", 's.activo=true', 'c.acepta_mensajeria=true'];
  const params = [];
  let i = 1;
  if (f.provincia)    { wh.push(`s.provincia = $${i++}`);          params.push(f.provincia); }
  if (f.comunidad)    { wh.push(`s.comunidad_autonoma = $${i++}`); params.push(f.comunidad); }
  if (f.tipo_socio)   { wh.push(`s.tipo_socio = $${i++}`);         params.push(f.tipo_socio); }
  if (f.rol_cluster)  { wh.push(`(rc.rol = $${i} OR rc.rol_secundario = $${i++})`);               params.push(f.rol_cluster); }
  if (f.disponibilidad){wh.push(`d.nivel = $${i++}`);              params.push(f.disponibilidad); }
  if (f.ambito)       { wh.push(`s.ambito = $${i++}`);             params.push(f.ambito); }
  if (f.solo_mentores === true || f.solo_mentores === 'true') {
    wh.push('d.tutor_mentor = true');
  }
  return { where: 'WHERE ' + wh.join(' AND '), params };
}

// Geocodifica en background el municipio de un socio recién creado o
// aprobado si aún no tiene coordenadas. `setImmediate` para no
// bloquear la respuesta HTTP: si Nominatim tarda, el admin ya recibió
// su 200 y la fila se completa después.
function geocodeSocioInBackground(socioId) {
  setImmediate(async () => {
    try {
      const socio = await db.findOne('socios', { id: socioId });
      if (!socio || socio.latitud != null || !socio.localidad || !socio.provincia) return;
      const coords = await geocodingService.geocode(
        `${socio.localidad}, ${socio.provincia}, España`
      );
      if (!coords) return;
      await db.query(
        'UPDATE socios SET latitud = $1, longitud = $2 WHERE id = $3',
        [coords.lat, coords.lng, socioId]
      );
    } catch (e) {
      console.warn('[geocode] background:', e.message);
    }
  });
}

class AdminController {
  async getEmailDeliveries(req, res) {
    try {
      const result = await db.query('SELECT recipient,status,error_code,created_at FROM email_delivery_log ORDER BY created_at DESC,id DESC LIMIT 100');
      res.json({deliveries:result.rows});
    } catch (_) { res.status(500).json({error:'No se pudo consultar el historial de envíos'}); }
  }


  // ==================== GESTIÓN DE SOCIOS PENDIENTES ====================
  
  async getSociosPendientes(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      const socios = await db.query(`
        SELECT s.id, s.email, s.nombre, s.apellidos, s.provincia, s.entidad, 
               s.cargo_actual, s.anos_experiencia, s.fecha_registro,
               rc.rol as rol_cluster, rc.b2b_ofrece, rc.b2b_busca, rc.b2b_licita,
               COALESCE((
                 SELECT array_agg(se2.especialidad ORDER BY se2.orden_prioridad)
                 FROM socio_especialidades se2
                 WHERE se2.socio_id = s.id
               ), ARRAY[]::VARCHAR[]) as especialidades
        FROM socios s
        LEFT JOIN rol_cluster rc ON s.id = rc.socio_id
        WHERE s.estado = 'pendiente' AND s.activo = true
        GROUP BY s.id, rc.rol, rc.b2b_ofrece, rc.b2b_busca, rc.b2b_licita
        ORDER BY s.fecha_registro ASC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);

      const total = await db.query(`
        SELECT COUNT(*) FROM socios WHERE estado = 'pendiente' AND activo = true
      `);

      res.json({
        socios: socios.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total.rows[0].count),
          pages: Math.ceil(total.rows[0].count / limit)
        }
      });

    } catch (error) {
      console.error('Error obteniendo socios pendientes:', error);
      res.status(500).json({ error: 'Error obteniendo socios pendientes' });
    }
  }

  async aprobarSocio(req, res) {
    try {
      const { socioId } = req.params;
      const { notas } = req.body;

      // Verificar que el socio existe y está pendiente
      const socio = await db.findOne('socios', { id: socioId, estado: 'pendiente' });
      if (!socio) {
        return res.status(404).json({ error: 'Socio no encontrado o ya procesado' });
      }

      // Aprobar socio
      await db.update('socios', {
        estado: 'aprobado',
        fecha_aprobacion: new Date(),
        aprobado_por: req.adminId,
        notas_moderacion: notas || null
      }, { id: socioId });

      // Enviar email de notificación
      const delivery = await emailService.notifySocioApproved({
        email: socio.email,
        nombre: socio.nombre,
        apellidos: socio.apellidos
      });

      // Auditar aprobación
      await auditAction(socioId, req.adminId, 'APPROVE_SOCIO', 'socios', socio, { estado: 'aprobado', notas }, req);

      // Geocodificar el municipio en background para que aparezca en
      // el mapa. No bloquea la respuesta al admin.
      geocodeSocioInBackground(socioId);

      res.json({
        message: delivery?.success ? 'Socio aprobado; correo aceptado por el servidor de envío' : 'Socio aprobado, pero el correo no se ha enviado. Revisa Correo saliente y reenvía la bienvenida.',
        notification_sent: !!delivery?.success,
        socio: {
          id: socioId,
          nombre: socio.nombre,
          apellidos: socio.apellidos,
          estado: 'aprobado'
        }
      });

    } catch (error) {
      console.error('Error aprobando socio:', error);
      res.status(500).json({ error: 'Error aprobando socio' });
    }
  }

  async rechazarSocio(req, res) {
    try {
      const { socioId } = req.params;
      const { motivo, notas } = req.body;

      if (!motivo) {
        return res.status(400).json({ error: 'Motivo de rechazo es requerido' });
      }

      const socio = await db.findOne('socios', { id: socioId, estado: 'pendiente' });
      if (!socio) {
        return res.status(404).json({ error: 'Socio no encontrado o ya procesado' });
      }

      // Rechazar socio
      await db.update('socios', {
        estado: 'rechazado',
        aprobado_por: req.adminId,
        notas_moderacion: `MOTIVO: ${motivo}. NOTAS: ${notas || 'N/A'}`
      }, { id: socioId });

      // Enviar email de notificación
      await emailService.notifySocioRejected({
        email: socio.email,
        nombre: socio.nombre,
        apellidos: socio.apellidos
      }, motivo);

      // Auditar rechazo
      await auditAction(socioId, req.adminId, 'REJECT_SOCIO', 'socios', socio, { estado: 'rechazado', motivo, notas }, req);

      res.json({ 
        message: `Socio ${socio.nombre} ${socio.apellidos} rechazado`,
        motivo
      });

    } catch (error) {
      console.error('Error rechazando socio:', error);
      res.status(500).json({ error: 'Error rechazando socio' });
    }
  }

  // ==================== GESTIÓN DE SOCIOS ACTIVOS ====================
  
  async getAllSocios(req, res) {
    try {
      const { 
        estado = 'aprobado', 
        provincia = '', 
        search = '',
        page = 1, 
        limit = 50 
      } = req.query;

      let query = `
        SELECT s.id, s.email, s.nombre, s.apellidos, s.provincia, s.entidad,
               s.estado, s.fecha_registro, s.fecha_aprobacion, s.ultimo_acceso,
               s.activo, s.notas_moderacion
        FROM socios s
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;

      if (estado) {
        query += ` AND s.estado = $${paramIndex}`;
        params.push(estado);
        paramIndex++;
      }

      if (provincia) {
        query += ` AND s.provincia = $${paramIndex}`;
        params.push(provincia);
        paramIndex++;
      }

      if (search) {
        query += ` AND (s.nombre ILIKE $${paramIndex} OR s.apellidos ILIKE $${paramIndex} OR s.email ILIKE $${paramIndex} OR s.entidad ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ` ORDER BY s.fecha_registro DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      const offset = (page - 1) * limit;
      params.push(limit, offset);

      const socios = await db.query(query, params);

      res.json({
        socios: socios.rows,
        filters: { estado, provincia, search },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });

    } catch (error) {
      console.error('Error obteniendo todos los socios:', error);
      res.status(500).json({ error: 'Error obteniendo socios' });
    }
  }

  async suspenderSocio(req, res) {
    try {
      const { socioId } = req.params;
      const { motivo, duracion_dias } = req.body;

      if (!motivo) {
        return res.status(400).json({ error: 'Motivo de suspensión es requerido' });
      }

      const socio = await db.findOne('socios', { id: socioId });
      if (!socio) {
        return res.status(404).json({ error: 'Socio no encontrado' });
      }

      const notas = `SUSPENDIDO: ${motivo}. DURACIÓN: ${duracion_dias || 'indefinida'} días. ADMIN: ${req.admin.nombre}`;

      await db.update('socios', {
        estado: 'suspendido',
        notas_moderacion: notas
      }, { id: socioId });

      // Auditar suspensión
      await auditAction(socioId, req.adminId, 'SUSPEND_SOCIO', 'socios', socio, { motivo, duracion_dias }, req);

      res.json({ 
        message: `Socio ${socio.nombre} ${socio.apellidos} suspendido`,
        motivo
      });

    } catch (error) {
      console.error('Error suspendiendo socio:', error);
      res.status(500).json({ error: 'Error suspendiendo socio' });
    }
  }

  async reactivarSocio(req, res) {
    try {
      const { socioId } = req.params;

      const socio = await db.findOne('socios', { id: socioId });
      if (!socio) {
        return res.status(404).json({ error: 'Socio no encontrado' });
      }

      await db.update('socios', {
        estado: 'aprobado',
        activo: true,
        notas_moderacion: null
      }, { id: socioId });

      // Auditar reactivación
      await auditAction(socioId, req.adminId, 'REACTIVATE_SOCIO', 'socios', socio, { estado: 'aprobado' }, req);

      res.json({ 
        message: `Socio ${socio.nombre} ${socio.apellidos} reactivado`,
        socio: {
          id: socioId,
          estado: 'aprobado'
        }
      });

    } catch (error) {
      console.error('Error reactivando socio:', error);
      res.status(500).json({ error: 'Error reactivando socio' });
    }
  }

  // ==================== CONFIGURACIÓN DEL SISTEMA ====================
  
  async getConfiguracion(req, res) {
    try {
      const config = await db.findMany('configuracion', {}, { 
        orderBy: 'clave' 
      });

      const configObj = {};
      config.forEach(item => {
        configObj[item.clave] = {
          valor: item.valor,
          tipo: item.tipo,
          descripcion: item.descripcion,
          updated_at: item.updated_at
        };
      });

      res.json({ configuracion: configObj });

    } catch (error) {
      console.error('Error obteniendo configuración:', error);
      res.status(500).json({ error: 'Error obteniendo configuración' });
    }
  }

  async updateConfiguracion(req, res) {
    try {
      const { configuracion } = req.body;

      if (!configuracion || typeof configuracion !== 'object') {
        return res.status(400).json({ error: 'Objeto configuración requerido' });
      }

      if (Object.prototype.hasOwnProperty.call(configuracion, 'mapa_prueba_temporal')) return res.status(400).json({ error: 'Utiliza el control específico del mapa de prueba' });
      const updated = [];

      for (const [clave, valor] of Object.entries(configuracion)) {
        await db.query(`
          UPDATE configuracion 
          SET valor = $1, updated_by = $2, updated_at = NOW()
          WHERE clave = $3
        `, [valor, req.adminId, clave]);
        
        updated.push(clave);
      }

      // Auditar cambios de configuración
      await auditAction(null, req.adminId, 'UPDATE_CONFIG', 'configuracion', null, configuracion, req);

      res.json({ 
        message: 'Configuración actualizada',
        updated_keys: updated
      });

    } catch (error) {
      console.error('Error actualizando configuración:', error);
      res.status(500).json({ error: 'Error actualizando configuración' });
    }
  }

  // ==================== ESTADÍSTICAS ADMIN ====================
  
  async getEstadisticasAdmin(req, res) {
    try {
      // Stats generales
      const stats = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM socios WHERE estado = 'aprobado' AND activo = true) as socios_activos,
          (SELECT COUNT(*) FROM socios WHERE estado = 'pendiente') as socios_pendientes,
          (SELECT COUNT(*) FROM socios WHERE estado = 'rechazado') as socios_rechazados,
          (SELECT COUNT(*) FROM socios WHERE estado = 'suspendido') as socios_suspendidos,
          (SELECT COUNT(*) FROM mensajes WHERE created_at > NOW() - INTERVAL '30 days') as mensajes_ultimo_mes,
          (SELECT COUNT(DISTINCT conversacion_id) FROM mensajes WHERE created_at > NOW() - INTERVAL '30 days') as conversaciones_activas
      `);

      // Registros por mes (últimos 12 meses)
      const registrosPorMes = await db.query(`
        SELECT 
          DATE_TRUNC('month', fecha_registro) as mes,
          COUNT(*) as registros,
          COUNT(*) FILTER (WHERE estado = 'aprobado') as aprobados
        FROM socios 
        WHERE fecha_registro > NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', fecha_registro)
        ORDER BY mes DESC
      `);

      // Provincias más activas
      const provinciasMasActivas = await db.query(`
        SELECT provincia, COUNT(*) as total
        FROM socios 
        WHERE estado = 'aprobado' AND activo = true
        GROUP BY provincia
        ORDER BY total DESC
      `);

      // Actividad reciente (últimos 7 días)
      const actividadReciente = await db.query(`
        SELECT 
          DATE(created_at) as fecha,
          accion,
          COUNT(*) as total
        FROM auditoria 
        WHERE created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at), accion
        ORDER BY fecha DESC, accion
      `);

      res.json({
        stats: stats.rows[0],
        top_especialidades: (await db.query(`
          SELECT especialidad, COUNT(*) AS total
          FROM vista_socios_completos, unnest(especialidades) AS especialidad
          GROUP BY especialidad ORDER BY total DESC LIMIT 6
        `)).rows,
        registros_por_mes: registrosPorMes.rows,
        provincias_mas_activas: provinciasMasActivas.rows,
        actividad_reciente: actividadReciente.rows,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error obteniendo estadísticas admin:', error);
      res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
  }

  // ==================== AUDITORÍA ====================
  
  async getAuditoria(req, res) {
    try {
      const { 
        socio_id = '', 
        admin_id = '', 
        accion = '', 
        desde = '', 
        hasta = '',
        page = 1, 
        limit = 100 
      } = req.query;

      let query = `
        SELECT a.*, s.nombre as socio_nombre, s.apellidos as socio_apellidos,
               ad.nombre as admin_nombre
        FROM auditoria a
        LEFT JOIN socios s ON a.socio_id = s.id
        LEFT JOIN administradores ad ON a.admin_id = ad.id
        WHERE 1=1
      `;
      
      const params = [];
      let paramIndex = 1;

      if (socio_id) {
        query += ` AND a.socio_id = $${paramIndex}`;
        params.push(parseInt(socio_id));
        paramIndex++;
      }

      if (admin_id) {
        query += ` AND a.admin_id = $${paramIndex}`;
        params.push(parseInt(admin_id));
        paramIndex++;
      }

      if (accion) {
        query += ` AND a.accion ILIKE $${paramIndex}`;
        params.push(`%${accion}%`);
        paramIndex++;
      }

      if (desde) {
        query += ` AND a.created_at >= $${paramIndex}`;
        params.push(desde);
        paramIndex++;
      }

      if (hasta) {
        query += ` AND a.created_at <= $${paramIndex}`;
        params.push(hasta);
        paramIndex++;
      }

      // Total de resultados con los mismos filtros (sin paginar) — se usa
      // para la paginación en la UI. Guardamos el WHERE construido antes
      // de añadir el LIMIT/OFFSET.
      const countQuery = `SELECT COUNT(*)::int AS c FROM auditoria a WHERE 1=1${query.split('WHERE 1=1')[1].split('ORDER BY')[0]}`;
      const totalRes = await db.query(countQuery, params.slice());
      const total = totalRes.rows[0].c;

      // Lista de acciones distintas para el filtro desplegable.
      const accionesDistintas = await db.query(
        'SELECT DISTINCT accion FROM auditoria ORDER BY accion'
      );

      query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      const offset = (page - 1) * limit;
      params.push(limit, offset);

      const auditoria = await db.query(query, params);

      res.json({
        auditoria: auditoria.rows,
        total,
        acciones: accionesDistintas.rows.map(function (r) { return r.accion; }),
        filters: { socio_id, admin_id, accion, desde, hasta },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      });

    } catch (error) {
      console.error('Error obteniendo auditoría:', error);
      res.status(500).json({ error: 'Error obteniendo logs de auditoría' });
    }
  }

  // ==================== MENSAJERÍA - MODERACIÓN ====================
  
  async getMensajesReportados(req, res) {
    try {
      const mensajes = await db.query(`
        SELECT m.id, m.contenido, m.created_at, m.motivo_moderacion,
               e.nombre as emisor_nombre, e.apellidos as emisor_apellidos,
               r.nombre as receptor_nombre, r.apellidos as receptor_apellidos
        FROM mensajes m
        JOIN socios e ON m.emisor_id = e.id
        JOIN socios r ON m.receptor_id = r.id
        WHERE m.reportado = true AND m.moderado = false
        ORDER BY m.created_at DESC
      `);

      res.json({ mensajes: mensajes.rows });

    } catch (error) {
      console.error('Error obteniendo mensajes reportados:', error);
      res.status(500).json({ error: 'Error obteniendo mensajes reportados' });
    }
  }

  async moderarMensaje(req, res) {
    try {
      const { mensajeId } = req.params;
      const { accion, motivo } = req.body; // accion: 'mantener' | 'eliminar'

      if (!['mantener', 'eliminar'].includes(accion)) {
        return res.status(400).json({ error: 'Acción debe ser mantener o eliminar' });
      }

      const mensaje = await db.findOne('mensajes', { id: mensajeId, reportado: true });
      if (!mensaje) {
        return res.status(404).json({ error: 'Mensaje no encontrado o no reportado' });
      }

      if (accion === 'eliminar') {
        await db.update('mensajes', {
          contenido: '[Mensaje eliminado por moderación]',
          moderado: true,
          motivo_moderacion: motivo
        }, { id: mensajeId });
      } else {
        await db.update('mensajes', {
          moderado: true,
          motivo_moderacion: `Revisado y mantenido: ${motivo}`
        }, { id: mensajeId });
      }

      // Auditar moderación
      await auditAction(null, req.adminId, 'MODERATE_MESSAGE', 'mensajes', mensaje, { accion, motivo }, req);

      res.json({ 
        message: `Mensaje ${accion === 'eliminar' ? 'eliminado' : 'mantenido'} por moderación`,
        accion
      });

    } catch (error) {
      console.error('Error moderando mensaje:', error);
      res.status(500).json({ error: 'Error moderando mensaje' });
    }
  }

  // ==================== CREAR ADMIN ====================
  
  async crearAdmin(req, res) {
    try {
      const { email, password, nombre, rol = 'admin' } = req.body;

      if (!email || !password || !nombre) {
        return res.status(400).json({ error: 'Email, contraseña y nombre son requeridos' });
      }

      // Verificar que no existe
      const existingAdmin = await db.findOne('administradores', { email });
      if (existingAdmin) {
        return res.status(400).json({ error: 'Ya existe un administrador con este email' });
      }

      // Hash contraseña
      const passwordHash = await hashPassword(password);

      // Crear administrador
      const nuevoAdmin = await db.insert('administradores', {
        email,
        password_hash: passwordHash,
        nombre,
        rol,
        activo: true
      });

      // Auditar creación
      await auditAction(null, req.adminId, 'CREATE_ADMIN', 'administradores', null, { 
        email, nombre, rol 
      }, req);

      res.status(201).json({
        message: 'Administrador creado correctamente',
        admin: {
          id: nuevoAdmin.id,
          email: nuevoAdmin.email,
          nombre: nuevoAdmin.nombre,
          rol: nuevoAdmin.rol
        }
      });

    } catch (error) {
      console.error('Error creando admin:', error);
      res.status(500).json({ error: 'Error creando administrador' });
    }
  }

  // =============================================================
  // ==================== IDENTIDAD ORGANIZACIÓN =================
  // =============================================================

  async getOrganizacion(req, res) {
    try {
      const row = await db.findOne('organizacion_config', { id: 1 });
      // Si no hay fila, devolvemos una por defecto
      const defaults = {
        id: 1,
        nombre: 'AGESPORT',
        tipo_organizacion: 'Asociación profesional',
        provincia: null,
        comunidad_autonoma: 'andalucia',
        web_institucional: 'https://agesport.org',
        email_remitente: null,
        descripcion_breve: 'Asociación Andaluza de Gestores del Deporte',
        logo_url: null,
        colores_corporativos: ['#0d355f', '#6da93f', '#37964f']
      };
      res.json({ organizacion: row || defaults });
    } catch (error) {
      console.error('Error obteniendo organización:', error);
      res.status(500).json({ error: 'Error obteniendo configuración' });
    }
  }

  async updateOrganizacion(req, res) {
    try {
      const adminId = req.adminId;
      const {
        nombre, tipo_organizacion, provincia, comunidad_autonoma,
        web_institucional, email_remitente, descripcion_breve,
        colores_corporativos
      } = req.body;

      // Buscar fila existente o crearla
      let row = await db.findOne('organizacion_config', { id: 1 });

      const data = {
        nombre: nombre,
        tipo_organizacion: tipo_organizacion,
        provincia: provincia,
        comunidad_autonoma: comunidad_autonoma,
        web_institucional: web_institucional,
        email_remitente: email_remitente,
        descripcion_breve: descripcion_breve,
        colores_corporativos: Array.isArray(colores_corporativos) ? JSON.stringify(colores_corporativos) : null,
        updated_by: adminId,
        updated_at: new Date()
      };

      if (row) {
        await db.update('organizacion_config', data, { id: 1 });
      } else {
        await db.insert('organizacion_config', Object.assign({ id: 1 }, data));
      }

      await auditAction(null, adminId, 'UPDATE_ORG_CONFIG', 'organizacion_config', row, data, req);
      const final = await db.findOne('organizacion_config', { id: 1 });
      res.json({ message: 'Organización actualizada', organizacion: final });
    } catch (error) {
      console.error('Error actualizando organización:', error);
      res.status(500).json({ error: 'Error actualizando configuración' });
    }
  }

  async uploadOrganizacionLogo(req, res) {
    try {
      const adminId = req.adminId;
      if (!req.file) return res.status(400).json({ error: 'No se ha recibido ningún fichero' });

      const previo = await db.findOne('organizacion_config', { id: 1 }, 'logo_url');
      const nuevaUrl = uploadService.toPublicUrl('logos', req.file.filename);

      if (previo) {
        await db.update('organizacion_config', { logo_url: nuevaUrl, updated_by: adminId, updated_at: new Date() }, { id: 1 });
      } else {
        await db.insert('organizacion_config', { id: 1, nombre: 'AGESPORT', logo_url: nuevaUrl, updated_by: adminId });
      }
      if (previo && previo.logo_url) uploadService.removeFile(previo.logo_url);

      await auditAction(null, adminId, 'UPLOAD_ORG_LOGO', 'organizacion_config', null, { logo_url: nuevaUrl }, req);
      res.json({ message: 'Logo actualizado', logo_url: nuevaUrl });
    } catch (error) {
      console.error('Error subiendo logo:', error);
      res.status(500).json({ error: 'Error subiendo logo' });
    }
  }

  // =============================================================
  // ==================== BAJAS PENDIENTES =======================
  // =============================================================

  async getBajasPendientes(req, res) {
    try {
      const result = await db.query(`
        SELECT bp.*, s.nombre, s.apellidos, s.email, s.entidad, s.provincia
        FROM bajas_pendientes bp
        JOIN socios s ON s.id = bp.socio_id
        ORDER BY bp.fecha_solicitud DESC
        LIMIT 200
      `);
      res.json({ bajas: result.rows });
    } catch (error) {
      console.error('Error obteniendo bajas:', error);
      res.status(500).json({ error: 'Error obteniendo bajas pendientes' });
    }
  }

  async gestionarBaja(req, res) {
    try {
      const { bajaId } = req.params;
      const { accion, notas_admin, llamada_realizada, fecha_llamada } = req.body;
      const adminId = req.adminId;

      const baja = await db.findOne('bajas_pendientes', { id: bajaId });
      if (!baja) return res.status(404).json({ error: 'Solicitud no encontrada' });

      const validas = ['aprobar', 'rechazar', 'marcar_revision', 'guardar_notas'];
      if (!validas.includes(accion)) return res.status(400).json({ error: 'Acción no válida' });

      const update = {
        notas_admin: notas_admin || baja.notas_admin,
        llamada_realizada: llamada_realizada !== undefined ? !!llamada_realizada : baja.llamada_realizada,
        fecha_llamada: fecha_llamada || baja.fecha_llamada,
        gestionado_por: adminId
      };

      if (accion === 'aprobar') {
        update.estado = 'aprobada';
        update.fecha_gestion = new Date();
        // Da de baja al socio (soft-delete)
        await db.update('socios', { activo: false, estado: 'rechazado', notas_moderacion: 'Baja aprobada por admin' }, { id: baja.socio_id });
      } else if (accion === 'rechazar') {
        update.estado = 'rechazada';
        update.fecha_gestion = new Date();
      } else if (accion === 'marcar_revision') {
        update.estado = 'en_revision';
      }

      await db.update('bajas_pendientes', update, { id: bajaId });
      await auditAction(null, adminId, 'MANAGE_UNSUBSCRIBE_' + accion.toUpperCase(), 'bajas_pendientes', baja, update, req);

      res.json({ message: 'Solicitud actualizada' });
    } catch (error) {
      console.error('Error gestionando baja:', error);
      res.status(500).json({ error: 'Error gestionando solicitud' });
    }
  }

  // =============================================================
  // ==================== IMPORTACIÓN CSV ========================
  // =============================================================

  async descargarPlantillaCSV(req, res) {
    // Cabecera con TODAS las columnas que el parser de import entiende.
    // Antes faltaba `localidad`, que `aprobarAccesoInvitado` exige al
    // crear el socio → el admin no podía aprobar nada importado.
    const header = [
      'nombre','apellidos','email','telefono','entidad','cargo_actual',
      'provincia','comunidad_autonoma','localidad','rol_cluster','tipo_socio','sector','rol_secundario','telefono_personal'
    ];
    const ejemplo = [
      'María','García López','maria.garcia@ejemplo.com','+34 600 000 000',
      'Club Deportivo Demo','Directora deportiva',
      'Sevilla','andalucia','Sevilla','operador_deportivo','numero','privado','formacion_talento_investigacion',''
    ];
    const body = header.join(',') + '\n' + ejemplo.map(csv.escape).join(',') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-socios-agesport.csv"');
    res.send(body);
  }

  async importarCSV(req, res) {
    try {
      const adminId = req.adminId;
      if (!req.file) return res.status(400).json({ error: 'No se ha recibido ningún fichero' });

      // Strip BOM (﻿) si Excel lo añadió al guardar el CSV. Sin
      // esto, la primera celda del header sería "﻿nombre" y todos
      // los lookups por `r.nombre` fallarían silenciosamente — la
      // usuaria reportaba "la plantilla descargada no se puede volver
      // a subir, tiene roaming" (BOM).
      let buffer = req.file.buffer.toString('utf8');
      if (buffer.charCodeAt(0) === 0xFEFF) buffer = buffer.slice(1);

      const lines = buffer.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
      if (lines.length < 2) return res.status(400).json({ error: 'El CSV está vacío' });

      const header = csv.parseLine(lines[0]).map((h) => h.trim().toLowerCase());
      const loteId = crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomBytes(16).toString('hex');
      const filas = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = csv.parseLine(lines[i]);
        const r = {};
        header.forEach(function (h, idx) { r[h] = (cols[idx] || '').trim() || null; });
        const errores = [];

        if (!r.email) errores.push('Falta el email');
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) errores.push('Email no válido');

        // Provincia: aceptamos cualquier variante razonable (mayúsculas,
        // sin tilde, con espacios) y la normalizamos al nombre canónico del
        // catálogo. Sin esto, "ALMERÍA" se rechazaba como "Provincia no válida".
        if (!r.provincia) errores.push('Falta la provincia');
        if (r.provincia) {
          const canon = catalogos.canonicalProvincia(r.provincia);
          if (canon) {
            r.provincia = canon; // ← guardamos ya el nombre canónico
          } else {
            errores.push('Provincia "' + r.provincia + '" no está en el catálogo');
          }
        }
        if (r.sector && !['publico','privado','tercer_sector'].includes(r.sector)) errores.push('Sector inválido');
        if (r.rol_secundario && (!catalogos.isValidRolSlug(r.rol_secundario) || !r.rol_cluster || r.rol_secundario === r.rol_cluster)) errores.push('Segundo rol inválido o repetido');
        if (r.rol_cluster && !catalogos.isValidRolSlug(r.rol_cluster)) {
          errores.push('Rol "' + r.rol_cluster + '" no está en el catálogo');
        }
        if (r.tipo_socio && !catalogos.isValidTipoSocio(r.tipo_socio)) {
          errores.push('Tipo de socio "' + r.tipo_socio + '" no está en el catálogo');
        }
        const ccaa = r.comunidad_autonoma || (r.provincia ? (catalogos.findCcaaByProvincia(r.provincia) || {}).slug : null);

        // Si la fila tiene errores de validación, queda en estado
        // 'con_errores' (CHECK constraint extendido por migración 014).
        // Antes "errores.length ? 'pendiente' : 'pendiente'" era una
        // tautología y filas inválidas pasaban a aprobables.
        let estado = errores.length ? 'con_errores' : 'pendiente';
        if (r.email) {
          // Sólo cuenta como duplicado si existe un socio ACTIVO con ese
          // email. Los borrados (activo=false / estado='rechazado') no
          // deben bloquear una nueva importación — antes cualquier baja
          // dejaba el email inutilizable para toda la vida.
          const exists = await db.query(
            `SELECT 1 FROM socios
             WHERE email = $1 AND activo = true AND estado <> 'rechazado'
             LIMIT 1`,
            [r.email]
          );
          if (exists.rows.length) {
            estado = 'duplicado';
            errores.push('Email ya existente en socios');
          }
        }

        const inserted = await db.insert('accesos_invitados', {
          lote_id: loteId,
          nombre: r.nombre,
          apellidos: r.apellidos,
          email: r.email,
          // La columna `telefono` plano fue eliminada por la migración
          // 004 — el INSERT antiguo fallaba con "column does not exist".
          // Ahora ciframos al insertar (AES-256 via encryptData).
          telefono_encrypted: r.telefono ? encryptData(r.telefono) : null,
          telefono_personal_encrypted: r.telefono_personal ? encryptData(r.telefono_personal) : null,
          sector: r.sector,
          rol_secundario: r.rol_secundario,
          entidad: r.entidad,
          cargo_actual: r.cargo_actual,
          provincia: r.provincia,
          comunidad_autonoma: ccaa,
          localidad: r.localidad,
          rol_cluster: r.rol_cluster,
          tipo_socio: r.tipo_socio || 'numero',
          estado: estado,
          errores: errores.length ? JSON.stringify(errores) : null,
          subido_por: adminId
        });
        filas.push(inserted);
      }

      await auditAction(null, adminId, 'IMPORT_CSV', 'accesos_invitados', null, { lote_id: loteId, filas: filas.length }, req);
      res.status(201).json({ message: 'CSV importado', lote_id: loteId, total: filas.length, filas: filas });
    } catch (error) {
      console.error('Error importando CSV:', error);
      res.status(500).json({ error: 'Error importando CSV: ' + error.message });
    }
  }

  async getAccesosInvitados(req, res) {
    try {
      const { lote_id, estado } = req.query;
      const conditions = [];
      const params = [];
      let idx = 1;
      if (lote_id) { conditions.push('lote_id = $' + idx++); params.push(lote_id); }
      if (estado) { conditions.push('estado = $' + idx++); params.push(estado); }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const sql = 'SELECT * FROM accesos_invitados ' + where + ' ORDER BY created_at DESC LIMIT 500';
      const result = await db.query(sql, params);
      res.json({ invitados: result.rows });
    } catch (error) {
      console.error('Error obteniendo invitados:', error);
      res.status(500).json({ error: 'Error obteniendo invitados' });
    }
  }

  // PUT /api/admin/socios/invitados/:invitadoId
  // Corrige una fila del CSV que quedó con errores, revalida y (si ya no
  // hay errores) la deja lista para aprobar.
  async updateAccesoInvitado(req, res) {
    try {
      const { invitadoId } = req.params;
      const invitado = await db.findOne('accesos_invitados', { id: invitadoId });
      if (!invitado) return res.status(404).json({ error: 'Fila no encontrada' });
      if (['aprobado', 'rechazado'].includes(invitado.estado)) {
        return res.status(409).json({ error: 'La fila ya fue procesada' });
      }

      // Campos editables desde la UI de importación
      const editable = ['nombre','apellidos','email','entidad','cargo_actual',
        'provincia','localidad','rol_cluster','tipo_socio','sector','rol_secundario'];
      const patch = {};
      for (const k of editable) {
        if (k in (req.body || {})) patch[k] = (req.body[k] || '').trim() || null;
      }

      // Normalizamos provincia + revalidamos catálogos
      const errores = [];
      const merged = { ...invitado, ...patch };
      if (!merged.email) errores.push('Falta el email');
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.email)) errores.push('Email no válido');
      if (!merged.provincia) errores.push('Falta la provincia');
      if (merged.provincia) {
        const canon = catalogos.canonicalProvincia(merged.provincia);
        if (canon) patch.provincia = canon;
        else errores.push('Provincia "' + merged.provincia + '" no está en el catálogo');
      }
      if (merged.sector && !['publico','privado','tercer_sector'].includes(merged.sector)) errores.push('Sector inválido');
      if (merged.rol_secundario && (!catalogos.isValidRolSlug(merged.rol_secundario) || !merged.rol_cluster || merged.rol_secundario === merged.rol_cluster)) errores.push('Segundo rol inválido o repetido');
      if (merged.rol_cluster && !catalogos.isValidRolSlug(merged.rol_cluster)) {
        errores.push('Rol "' + merged.rol_cluster + '" no está en el catálogo');
      }
      if (merged.tipo_socio && !catalogos.isValidTipoSocio(merged.tipo_socio)) {
        errores.push('Tipo de socio "' + merged.tipo_socio + '" no está en el catálogo');
      }

      // Duplicado: sólo si hay un socio ACTIVO con ese email
      if (merged.email) {
        const dup = await db.query(
          `SELECT 1 FROM socios
           WHERE email = $1 AND activo = true AND estado <> 'rechazado' LIMIT 1`,
          [merged.email]
        );
        if (dup.rows.length) errores.push('Email ya existente en socios');
      }

      let nuevoEstado;
      if (errores.length === 0) nuevoEstado = 'pendiente';
      else if (errores.some((e) => e.startsWith('Email ya existente'))) nuevoEstado = 'duplicado';
      else nuevoEstado = 'con_errores';

      // Autocompletamos CCAA si viene provincia y no CCAA
      if (patch.provincia && !merged.comunidad_autonoma) {
        const ca = catalogos.findCcaaByProvincia(patch.provincia);
        if (ca) patch.comunidad_autonoma = ca.slug;
      }

      patch.estado = nuevoEstado;
      patch.errores = errores.length ? JSON.stringify(errores) : null;

      await db.update('accesos_invitados', patch, { id: invitadoId });
      const refreshed = await db.findOne('accesos_invitados', { id: invitadoId });
      res.json({
        message: nuevoEstado === 'pendiente'
          ? 'Fila corregida y lista para aprobar'
          : 'Fila actualizada · ' + errores.length + ' error(es) pendiente(s)',
        fila: refreshed,
      });
    } catch (error) {
      console.error('Error actualizando invitado:', error);
      res.status(500).json({ error: 'No se pudo guardar la fila' });
    }
  }

  async aprobarAccesoInvitado(req, res) {
    try {
      const { invitadoId } = req.params;
      const adminId = req.adminId;
      const tempPass = crypto.randomBytes(12).toString('hex') + 'Aa1!';
      const passwordHash = await hashPassword(tempPass);
      const nuevoSocio = await db.transaction(async client => {
        const invitado = (await client.query('SELECT * FROM accesos_invitados WHERE id=$1 FOR UPDATE', [invitadoId])).rows[0];
        const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
        if (!invitado) fail(404, 'Invitado no encontrado');
        if (invitado.estado !== 'pendiente') fail(409, 'La fila ya se ha procesado o tiene errores');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitado.email || '')) fail(400, 'Email no válido; corrige la fila antes de aprobar');
        if (!catalogos.isValidProvincia(invitado.provincia)) fail(400, 'Indica una provincia válida antes de aprobar');
        if (invitado.rol_secundario && (!catalogos.isValidRolSlug(invitado.rol_secundario) || !invitado.rol_cluster || invitado.rol_secundario === invitado.rol_cluster)) fail(400, 'Corrige el segundo rol');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [invitado.email]);
        const previo = (await client.query('SELECT * FROM socios WHERE email=$1 FOR UPDATE', [invitado.email])).rows[0];
        if (previo && previo.activo && previo.estado !== 'rechazado') fail(409, 'Este email ya tiene una cuenta activa');
        const values = {
          email: invitado.email, password_hash: passwordHash, nombre: invitado.nombre || 'Socio', apellidos: invitado.apellidos || '',
          telefono_encrypted: invitado.telefono_encrypted, telefono_personal_encrypted: invitado.telefono_personal_encrypted,
          entidad: invitado.entidad, cargo_actual: invitado.cargo_actual, provincia: invitado.provincia,
          comunidad_autonoma: invitado.comunidad_autonoma, localidad: invitado.localidad || invitado.provincia,
          tipo_socio: invitado.tipo_socio || 'numero', sector: invitado.sector || null,
          estado: 'aprobado', activo: true, notas_moderacion: null,
        };
        const keys = Object.keys(values);
        const result = previo
          ? await client.query(`UPDATE socios SET ${keys.map((k,i)=>k+'=$'+(i+1)).join(',')}, password_changed_at=NOW() WHERE id=$${keys.length+1} RETURNING id,email,nombre`, [...Object.values(values),previo.id])
          : await client.query(`INSERT INTO socios (${keys.join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING id,email,nombre`, Object.values(values));
        const socio = result.rows[0];
        await client.query('DELETE FROM rol_cluster WHERE socio_id=$1', [socio.id]);
        if (invitado.rol_cluster) await client.query('INSERT INTO rol_cluster(socio_id,rol,rol_secundario) VALUES($1,$2,$3)', [socio.id,invitado.rol_cluster,invitado.rol_secundario || null]);
        await client.query(`INSERT INTO consentimientos(socio_id,acepta_mapa_interactivo,acepta_visibilidad_datos,acepta_mensajeria,acepta_notificaciones_email)
          VALUES($1,false,false,false,false) ON CONFLICT(socio_id) DO NOTHING`, [socio.id]);
        await client.query("UPDATE accesos_invitados SET estado='aprobado',socio_creado_id=$2,fecha_resolucion=NOW() WHERE id=$1", [invitadoId,socio.id]);
        return socio;
      });
      const adminRow = await db.findOne('administradores', { id: adminId });
      let delivery;
      try { delivery = await emailService.sendAccountApproved(nuevoSocio, {passwordTemporal:tempPass,adminNombre:adminRow ? adminRow.nombre : 'AGESPORT'}); }
      catch (_) { delivery = {success:false}; }
      await auditAction(null, adminId, 'APPROVE_INVITED', 'accesos_invitados', null, { socio_id:nuevoSocio.id, email_sent:!!delivery?.success }, req);
      geocodeSocioInBackground(nuevoSocio.id);
      res.json({ message: delivery?.success ? 'Acceso creado; correo aceptado por el servidor de envío' : 'Acceso creado, pero el correo no se ha enviado. Revisa Correo saliente y envía una recuperación de contraseña.',
        notification_sent:!!delivery?.success, socio_id:nuevoSocio.id });
    } catch (error) {
      if (error.status) return res.status(error.status).json({error:error.message});
      if (error.code === '23505') return res.status(409).json({error:'Este email ya tiene una cuenta; actualiza el listado'});
      console.error('Error aprobando invitado:', error);
      res.status(500).json({error:'No se pudo crear el acceso. La operación se ha revertido.'});
    }
  }

  // =============================================================
  // ==================== ACCESOS GENERADOS ======================
  // =============================================================

  async getAccesosGenerados(req, res) {
    try {
      const estado = req.query.estado || '';
      if (estado && !['aprobado','pendiente','suspendido','rechazado'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });
      const result = await db.query(`
        SELECT s.id, s.email, s.nombre, s.apellidos, s.entidad, s.provincia,
               s.comunidad_autonoma, s.tipo_socio, s.estado, s.activo,
               s.ultimo_acceso, s.fecha_registro
        FROM socios s
        WHERE s.activo = true AND ($1::text = '' OR s.estado::text = $1)
        ORDER BY s.ultimo_acceso DESC NULLS LAST, s.fecha_registro DESC
      `, [estado]);
      res.json({ socios: result.rows });
    } catch (error) {
      console.error('Error obteniendo accesos:', error);
      res.status(500).json({ error: 'Error obteniendo accesos' });
    }
  }

  // =============================================================
  // ==================== EXPORTACIÓN CSV ========================
  // =============================================================
  // Exporta todos los socios (con filtros opcionales por estado).
  // Devuelve CSV con BOM UTF-8 para que Excel y Numbers respeten los acentos.
  // Las especialidades y el rol del clúster salen como etiquetas legibles.

  async exportarSociosCSV(req, res) {
    try {
      const adminId = req.adminId;
      const { estado, incluirInactivos } = req.query;
      if (estado && !['aprobado','pendiente','suspendido','rechazado'].includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

      // Filtros opcionales
      const conditions = [];
      const params = [];
      let idx = 1;

      if (estado && ['aprobado', 'pendiente', 'rechazado', 'suspendido'].includes(estado)) {
        conditions.push('s.estado = $' + idx++);
        params.push(estado);
      }
      if (incluirInactivos !== 'true') {
        conditions.push('s.activo = true');
      }
      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const sql = `
        SELECT
          s.id,
          s.email,
          s.email_personal,
          s.email_preferido,
          s.nombre,
          s.apellidos,
          s.tipo_socio,
          s.nombre_organizacion,
          s.entidad,
          s.cargo_actual,
          s.anos_experiencia,
          s.telefono_encrypted, s.telefono_personal_encrypted, s.sector,
          s.web_profesional,
          s.linkedin_url,
          s.provincia,
          s.comunidad_autonoma,
          s.localidad,
          s.codigo_postal,
          s.ambito,
          s.estado,
          s.activo,
          s.fecha_registro,
          s.ultimo_acceso,
          rc.rol AS rol_cluster, rc.rol_secundario,
          rc.b2b_ofrece,
          rc.b2b_busca,
          rc.b2b_licita,
          d.nivel AS disponibilidad,
          (
            SELECT string_agg(especialidad, '; ' ORDER BY orden_prioridad)
            FROM socio_especialidades
            WHERE socio_id = s.id
          ) AS especialidades,
          c.acepta_mensajeria,
          c.acepta_notificaciones_email,
          c.visible_telefono,
          c.visible_email_directo
        FROM socios s
        LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
        LEFT JOIN disponibilidad d ON d.socio_id = s.id
        LEFT JOIN consentimientos c ON c.socio_id = s.id
        ${where}
        ORDER BY s.fecha_registro DESC
      `;

      const result = await db.query(sql, params);

      // Helpers para etiquetas legibles
      const labelRol = (slug) => {
        const r = catalogos.findRolBySlug(slug);
        return r ? r.label : (slug || '');
      };
      const labelEspecialidades = (raw) => {
        if (!raw) return '';
        return raw.split('; ').map((slug) => {
          const e = catalogos.findEspecialidadBySlug(slug);
          return e ? e.label : slug;
        }).join('; ');
      };
      const labelTipoSocio = (slug) => {
        const t = catalogos.TIPOS_SOCIO.find(function (x) { return x.slug === slug; });
        return t ? t.label : (slug || '');
      };
      const labelCcaa = (slug) => {
        const c = catalogos.COMUNIDADES_AUTONOMAS.find(function (x) { return x.slug === slug; });
        return c ? c.label : (slug || '');
      };
      const fmtBool = (v) => v === true ? 'Sí' : (v === false ? 'No' : '');
      const fmtDate = (d) => {
        if (!d) return '';
        try { return new Date(d).toISOString().slice(0, 19).replace('T', ' '); }
        catch (e) { return ''; }
      };

      // Construir CSV (RFC 4180, separador coma, encoding UTF-8 con BOM para Excel)
      const escapeCSV = csv.escape;

      const header = [
        'ID', 'Email profesional', 'Email personal', 'Email preferido',
        'Nombre', 'Apellidos', 'Tipo de socio', 'Organización',
        'Entidad', 'Cargo actual', 'Años de experiencia',
        'Teléfono', 'Web profesional', 'LinkedIn',
        'Provincia', 'Comunidad autónoma', 'Localidad', 'Código postal', 'Ámbito',
        'Estado', 'Activo', 'Fecha registro', 'Último acceso',
        'Rol del clúster', 'B2B ofrece', 'B2B busca', 'B2B licita',
        'Disponibilidad', 'Especialidades',
        'Acepta mensajería', 'Acepta notificaciones email',
        'Visible teléfono', 'Visible email directo', 'Teléfono personal', 'Sector', 'Segundo rol'
      ];

      const rows = result.rows.map(function (r) {
        return [
          r.id,
          r.email,
          r.email_personal,
          r.email_preferido,
          r.nombre,
          r.apellidos,
          labelTipoSocio(r.tipo_socio),
          r.nombre_organizacion,
          r.entidad,
          r.cargo_actual,
          r.anos_experiencia,
          r.telefono_encrypted ? (function () { try { return decryptData(r.telefono_encrypted); } catch (_) { return ''; } })() : '',
          r.web_profesional,
          r.linkedin_url,
          r.provincia,
          labelCcaa(r.comunidad_autonoma),
          r.localidad,
          r.codigo_postal,
          r.ambito,
          r.estado,
          fmtBool(r.activo),
          fmtDate(r.fecha_registro),
          fmtDate(r.ultimo_acceso),
          labelRol(r.rol_cluster),
          fmtBool(r.b2b_ofrece),
          fmtBool(r.b2b_busca),
          fmtBool(r.b2b_licita),
          r.disponibilidad,
          labelEspecialidades(r.especialidades),
          fmtBool(r.acepta_mensajeria),
          fmtBool(r.acepta_notificaciones_email),
          fmtBool(r.visible_telefono),
          fmtBool(r.visible_email_directo),
          r.telefono_personal_encrypted ? decryptData(r.telefono_personal_encrypted) : '',
          ({publico:'Sector público',privado:'Sector privado',tercer_sector:'Tercer sector'})[r.sector] || '',
          labelRol(r.rol_secundario)
        ].map(escapeCSV).join(',');
      });

      // BOM UTF-8 para que Excel/Numbers detecten encoding y acentos
      const bom = '\uFEFF';
      const csvBody = bom + header.map(escapeCSV).join(',') + '\n' + rows.join('\n') + '\n';

      // Audit
      try {
        await auditAction(null, adminId, 'EXPORT_SOCIOS_CSV', 'socios', null,
          { total: result.rows.length, filtro_estado: estado || 'todos' }, req);
      } catch (e) { /* no bloquear la descarga si la auditoría falla */ }

      const fecha = new Date().toISOString().slice(0, 10);
      const sufijo = estado ? ('-' + estado) : '';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        'attachment; filename="agesport-socios' + sufijo + '-' + fecha + '.csv"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(csvBody);
    } catch (error) {
      console.error('Error exportando CSV:', error);
      res.status(500).json({ error: 'Error generando la exportación CSV' });
    }
  }

  // =============== CORREO SALIENTE (SMTP) ===============

  // GET /api/admin/config/smtp — devuelve la config actual sin exponer
  // la contraseña. Un booleano `passwordSet` indica si está guardada.
  async getSmtpConfig(req, res) {
    try {
      const row = await db.findOne('configuracion', { clave: 'smtp_config' });
      const cfg = row ? JSON.parse(row.valor) : null;
      res.json({
        config: cfg ? {
          host: cfg.host || '',
          port: cfg.port || 587,
          secure: !!cfg.secure,
          user: cfg.user || '',
          fromName: cfg.fromName || '',
          fromEmail: cfg.fromEmail || cfg.user || '',
          replyTo: cfg.replyTo || '',
          passwordSet: !!cfg.passEncrypted,
        } : null,
      });
    } catch (error) {
      console.error('Error leyendo SMTP config:', error);
      res.status(500).json({ error: 'No se pudo leer la configuración SMTP' });
    }
  }

  // POST /api/admin/config/smtp — persiste la config. La contraseña se
  // guarda cifrada con AES-256 (ENCRYPTION_KEY del .env). Si viene vacía
  // conservamos la anterior; así el admin puede editar host/port/etc. sin
  // volver a teclear la contraseña.
  async saveSmtpConfig(req, res) {
    try {
      const { host, port, secure, user, pass, fromName, fromEmail, replyTo } = req.body || {};
      if (!host || !user || !fromEmail) {
        return res.status(400).json({ error: 'Host, usuario y email remitente son obligatorios.' });
      }
      const previous = await db.findOne('configuracion', { clave: 'smtp_config' });
      const prevCfg = previous ? JSON.parse(previous.valor) : {};
      const cfg = {
        host: String(host).trim(),
        port: parseInt(port) || 587,
        secure: !!secure,
        user: String(user).trim(),
        fromName: (fromName || 'AGESPORT · Mapa del Talento').trim(),
        fromEmail: String(fromEmail).trim(),
        replyTo: (replyTo || '').trim() || null,
        passEncrypted: pass ? encryptData(pass) : (prevCfg.passEncrypted || null),
      };
      const payload = JSON.stringify(cfg);
      if (previous) {
        await db.query('UPDATE configuracion SET valor = $1, updated_at = NOW() WHERE clave = $2',
          [payload, 'smtp_config']);
      } else {
        await db.insert('configuracion', { clave: 'smtp_config', valor: payload });
      }
      // Recarga en caliente el transporter del emailService.
      try { require('../services/emailService').reloadFromConfig(cfg); } catch (e) {
        console.warn('No se pudo recargar emailService:', e.message);
      }
      await auditAction(null, req.adminId, 'UPDATE_SMTP_CONFIG', 'configuracion',
        null, { host: cfg.host, fromEmail: cfg.fromEmail }, req);
      res.json({ message: 'Configuración de correo saliente guardada correctamente.' });
    } catch (error) {
      console.error('Error guardando SMTP config:', error);
      res.status(500).json({ error: 'No se pudo guardar la configuración SMTP' });
    }
  }

  // POST /api/admin/config/smtp/test — envía un correo de prueba usando
  // la configuración indicada (sin persistirla). Útil para validar
  // credenciales antes de "Guardar".
  async testSmtpConfig(req, res) {
    try {
      const { host, port, secure, user, pass, fromName, fromEmail, replyTo, to } = req.body || {};
      if (!to || !host || !user) {
        return res.status(400).json({ error: 'Necesitamos host, usuario y destinatario de la prueba.' });
      }
      // Si no viene contraseña, usamos la ya guardada (descifrada) — así
      // el admin puede probar sin re-teclear el secret.
      let passClear = pass;
      if (!passClear) {
        const prev = await db.findOne('configuracion', { clave: 'smtp_config' });
        if (prev) {
          const prevCfg = JSON.parse(prev.valor);
          if (prevCfg.passEncrypted) {
            try { passClear = decryptData(prevCfg.passEncrypted); } catch (_) { /* nada */ }
          }
        }
      }
      const emailService = require('../services/emailService');
      const result = await emailService.sendTestEmail({
        host, port: parseInt(port) || 587, secure: !!secure,
        user, pass: passClear,
        fromName: fromName || 'AGESPORT · Mapa del Talento',
        fromEmail: fromEmail || user,
        replyTo: replyTo || null,
      }, to);
      if (result.success) {
        res.json({ message: 'Email de prueba enviado a ' + to + '. Revisa la bandeja de entrada.' });
      } else {
        res.status(502).json({ error: result.error || 'El servidor SMTP rechazó la conexión.' });
      }
    } catch (error) {
      console.error('Error probando SMTP:', error);
      res.status(500).json({ error: error.message || 'No se pudo enviar el correo de prueba.' });
    }
  }

  // =============== GESTIÓN DE ADMINISTRADORES (SUPERADMIN) ===============

  // GET /api/admin/administradores — listar todos los administradores.
  async listAdmins(req, res) {
    try {
      const result = await db.query(
        `SELECT id, email, nombre, rol, activo, created_at, ultimo_acceso
         FROM administradores ORDER BY id ASC`
      );
      res.json({ administradores: result.rows });
    } catch (error) {
      console.error('Error listando admins:', error);
      res.status(500).json({ error: 'No se pudo obtener la lista de administradores' });
    }
  }

  // POST /api/admin/administradores — crear nuevo admin.
  async createAdmin(req, res) {
    try {
      const { email, nombre, password, rol } = req.body || {};
      if (!email || !nombre || !password) {
        return res.status(400).json({ error: 'Email, nombre y contraseña son obligatorios.' });
      }
      const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
      if (!strong.test(password)) {
        return res.status(400).json({
          error: 'Contraseña débil: mínimo 8 caracteres con 1 mayúscula, 1 minúscula y 1 número.',
        });
      }
      const rolLimpio = rol === 'superadmin' ? 'superadmin' : 'admin';
      const existing = await db.findOne('administradores', { email: email.trim().toLowerCase() });
      if (existing) return res.status(409).json({ error: 'Ya existe un administrador con ese email.' });

      const hash = await hashPassword(password);
      const inserted = await db.insert('administradores', {
        email: email.trim().toLowerCase(),
        nombre: nombre.trim(),
        password_hash: hash,
        rol: rolLimpio,
        activo: true,
      });
      await auditAction(null, req.adminId, 'CREATE_ADMIN', 'administradores',
        null, { id: inserted.id, email: inserted.email, rol: rolLimpio }, req);
      res.status(201).json({
        message: 'Administrador creado correctamente.',
        administrador: {
          id: inserted.id, email: inserted.email, nombre: inserted.nombre,
          rol: inserted.rol, activo: inserted.activo,
        },
      });
    } catch (error) {
      console.error('Error creando admin:', error);
      res.status(500).json({ error: 'No se pudo crear el administrador' });
    }
  }

  // PUT /api/admin/administradores/:id — cambiar nombre / rol / activo.
  // Un superadmin NO puede quitarse a sí mismo el rol ni desactivarse (regla
  // de seguridad: siempre debe quedar al menos un superadmin operativo).
  async updateAdmin(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'ID inválido' });
      const { nombre, rol, activo } = req.body || {};
      const target = await db.findOne('administradores', { id });
      if (!target) return res.status(404).json({ error: 'Administrador no encontrado' });

      const changes = {};
      if (nombre !== undefined) changes.nombre = String(nombre).trim();
      if (rol !== undefined) changes.rol = (rol === 'superadmin' ? 'superadmin' : 'admin');
      if (activo !== undefined) changes.activo = !!activo;

      // Auto-protección: si el superadmin actual es el único, no puede degradarse
      // ni desactivarse.
      if (id === req.adminId) {
        const superCount = await db.query(
          "SELECT COUNT(*)::int AS c FROM administradores WHERE rol='superadmin' AND activo=true"
        );
        const soloYo = superCount.rows[0].c <= 1 && target.rol === 'superadmin';
        if (soloYo && (changes.rol === 'admin' || changes.activo === false)) {
          return res.status(400).json({
            error: 'No puedes degradar ni desactivar al único superadmin activo. Nombra otro superadmin primero.',
          });
        }
      }

      if (Object.keys(changes).length === 0) {
        return res.json({ message: 'Sin cambios' });
      }
      await db.update('administradores', changes, { id });
      await auditAction(null, req.adminId, 'UPDATE_ADMIN', 'administradores',
        { id: target.id, rol: target.rol, activo: target.activo }, changes, req);
      res.json({ message: 'Administrador actualizado correctamente.' });
    } catch (error) {
      console.error('Error actualizando admin:', error);
      res.status(500).json({ error: 'No se pudo actualizar el administrador' });
    }
  }

  // POST /api/admin/administradores/:id/reset-password — enviar email de
  // restablecimiento al admin destino (reutiliza el flujo público existente).
  async resetAdminPassword(req, res) {
    try {
      const id = parseInt(req.params.id);
      const target = await db.findOne('administradores', { id });
      if (!target) return res.status(404).json({ error: 'Administrador no encontrado' });

      const crypto = require('crypto');
      const raw = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      await db.query(
        `INSERT INTO admin_password_reset_tokens (admin_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [id, hash]
      );
      const base = require('../config/config').app.publicBaseUrl.replace(/\/$/, '');
      const resetUrl = `${base || 'http://localhost:3001'}/restablecer.html?type=admin&token=${raw}`;
      try {
        const emailService = require('../services/emailService');
        const delivery = await emailService.sendPasswordReset(
          { email: target.email, nombre: target.nombre },
          { resetUrl, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
        );
        if (!delivery?.success) return res.status(502).json({error:delivery?.error || 'No se pudo enviar el correo de recuperación'});
      } catch (_) { return res.status(502).json({error:'No se pudo enviar el correo de recuperación'}); }
      await auditAction(null, req.adminId, 'ADMIN_RESET_PASSWORD_REQUEST',
        'administradores', null, { target_id: id, target_email: target.email }, req);
      res.json({ message: 'Correo de recuperación aceptado por el servidor de envío para ' + target.email });
    } catch (error) {
      console.error('Error reset admin password:', error);
      res.status(500).json({ error: 'No se pudo iniciar el reseteo' });
    }
  }

  // DELETE /api/admin/administradores/:id — desactivación (soft-delete).
  // Sólo marca activo=false. La auditoría se mantiene por integridad.
  async deactivateAdmin(req, res) {
    try {
      const id = parseInt(req.params.id);
      if (id === req.adminId) {
        return res.status(400).json({ error: 'No puedes desactivarte a ti mismo.' });
      }
      const target = await db.findOne('administradores', { id });
      if (!target) return res.status(404).json({ error: 'Administrador no encontrado' });
      // Si el target es el último superadmin, bloquear
      if (target.rol === 'superadmin') {
        const r = await db.query(
          "SELECT COUNT(*)::int AS c FROM administradores WHERE rol='superadmin' AND activo=true"
        );
        if (r.rows[0].c <= 1) {
          return res.status(400).json({ error: 'No puedes desactivar al único superadmin activo.' });
        }
      }
      await db.update('administradores', { activo: false }, { id });
      await auditAction(null, req.adminId, 'DEACTIVATE_ADMIN', 'administradores',
        { id, email: target.email }, { activo: false }, req);
      res.json({ message: 'Administrador desactivado.' });
    } catch (error) {
      console.error('Error desactivando admin:', error);
      res.status(500).json({ error: 'No se pudo desactivar' });
    }
  }

  // =============== GESTIÓN AVANZADA DE SOCIOS (SUPERADMIN) ===============

  // PUT /api/admin/socios/:socioId/tipo — cambiar tipo_socio.
  async changeSocioType(req, res) {
    try {
      const id = parseInt(req.params.socioId);
      const { tipo_socio } = req.body || {};
      if (!catalogos.isValidTipoSocio(tipo_socio)) {
        return res.status(400).json({ error: 'Tipo de socio no válido' });
      }
      const target = await db.findOne('socios', { id });
      if (!target) return res.status(404).json({ error: 'Socio no encontrado' });
      await db.update('socios', { tipo_socio }, { id });
      await auditAction(null, req.adminId, 'CHANGE_SOCIO_TYPE', 'socios',
        { id, tipo_anterior: target.tipo_socio }, { tipo_socio }, req);
      res.json({ message: 'Tipo de socio actualizado a: ' + tipo_socio });
    } catch (error) {
      console.error('Error cambio tipo socio:', error);
      res.status(500).json({ error: 'No se pudo cambiar el tipo' });
    }
  }

  // POST /api/admin/socios/:socioId/reenviar-bienvenida — reenvía el email
  // de bienvenida al socio. Muy demandado en soporte de primer día.
  async reenviarBienvenida(req, res) {
    try {
      const id = parseInt(req.params.socioId);
      const socio = await db.findOne('socios', { id });
      if (!socio) return res.status(404).json({ error: 'Socio no encontrado' });
      if (socio.estado !== 'aprobado' || !socio.activo) {
        return res.status(400).json({
          error: 'Sólo se puede reenviar la bienvenida a socios aprobados y activos.',
        });
      }
      const emailService = require('../services/emailService');
      const result = await emailService.notifySocioApproved({
        email: socio.email, nombre: socio.nombre, apellidos: socio.apellidos,
      });
      await auditAction(null, req.adminId, 'RESEND_WELCOME_EMAIL', 'socios',
        null, { target_id: id, target_email: socio.email }, req);
      if (!result || result.success !== true) {
        return res.status(502).json({
          error: 'No se pudo enviar: ' + (result?.error || 'SMTP no disponible'),
        });
      }
      res.json({ message: 'Correo de bienvenida aceptado por el servidor de envío para ' + socio.email });
    } catch (error) {
      console.error('Error reenviando bienvenida:', error);
      res.status(500).json({ error: 'No se pudo reenviar el email' });
    }
  }

  // GET /api/admin/stats/altas-mensuales — altas de socios por mes en los
  // últimos 12 meses. Devuelve todos los meses en el rango aunque valgan 0
  // (para que el gráfico salga sin huecos).
  async getAltasMensuales(req, res) {
    try {
      const result = await db.query(`
        WITH meses AS (
          SELECT date_trunc('month', d)::date AS mes
          FROM generate_series(
            date_trunc('month', NOW()) - INTERVAL '11 months',
            date_trunc('month', NOW()),
            INTERVAL '1 month'
          ) AS d
        ),
        altas AS (
          SELECT date_trunc('month', fecha_registro)::date AS mes,
                 COUNT(*)::int AS n
          FROM socios
          WHERE estado = 'aprobado'
            AND fecha_registro >= date_trunc('month', NOW()) - INTERVAL '11 months'
          GROUP BY 1
        )
        SELECT m.mes, COALESCE(a.n, 0) AS altas
        FROM meses m LEFT JOIN altas a USING (mes)
        ORDER BY m.mes;
      `);
      const total = result.rows.reduce(function (s, r) { return s + r.altas; }, 0);
      res.json({
        meses: result.rows.map(function (r) {
          const d = new Date(r.mes);
          return {
            mes: d.toISOString().slice(0, 7),
            label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
            altas: r.altas,
          };
        }),
        total_12m: total,
      });
    } catch (error) {
      console.error('Error stats altas mensuales:', error);
      res.status(500).json({ error: 'No se pudo calcular la evolución mensual' });
    }
  }

  // GET /api/admin/auditoria/exportar — CSV con los mismos filtros que /auditoria.
  async exportarAuditoriaCSV(req, res) {
    try {
      const { accion, socio_id, admin_id, desde, hasta } = req.query;
      const params = [];
      const wh = [];
      let i = 1;
      if (accion)   { wh.push(`a.accion = $${i++}`);      params.push(accion); }
      if (socio_id) { wh.push(`a.socio_id = $${i++}`);    params.push(parseInt(socio_id)); }
      if (admin_id) { wh.push(`a.admin_id = $${i++}`);    params.push(parseInt(admin_id)); }
      if (desde)    { wh.push(`a.created_at >= $${i++}`); params.push(desde); }
      if (hasta)    { wh.push(`a.created_at <= $${i++}`); params.push(hasta); }
      const where = wh.length ? 'WHERE ' + wh.join(' AND ') : '';

      const rows = await db.query(
        `SELECT a.id, a.accion, a.recurso, a.created_at,
                a.ip_address::text AS ip,
                s.email AS socio, ad.email AS admin
         FROM auditoria a
         LEFT JOIN socios s ON s.id = a.socio_id
         LEFT JOIN administradores ad ON ad.id = a.admin_id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT 10000`, params
      );
      const escapeCSV = csv.escape;
      const header = ['ID','Fecha','Acción','Recurso','Socio','Admin','IP'];
      const body = rows.rows.map(function (r) {
        return [
          r.id,
          new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' '),
          r.accion, r.recurso || '', r.socio || '', r.admin || '', r.ip || '',
        ].map(escapeCSV).join(',');
      });
      const bom = '﻿';
      const csvOut = bom + header.map(escapeCSV).join(',') + '\n' + body.join('\n') + '\n';
      const fecha = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition',
        'attachment; filename="agesport-auditoria-' + fecha + '.csv"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(csvOut);
    } catch (error) {
      console.error('Error exportando auditoría:', error);
      res.status(500).json({ error: 'No se pudo exportar la auditoría' });
    }
  }

  // =============== COMUNICACIONES MASIVAS ===============

  // POST /api/admin/comunicaciones/preview — cuántos socios recibirán.
  async previewComunicacion(req, res) {
    try {
      const filtros = req.body || {};
      const { where, params } = buildSocioFilterWhere(filtros);
      const result = await db.query(
        `SELECT COUNT(DISTINCT s.id)::int AS total
         FROM socios s
         JOIN consentimientos c ON c.socio_id = s.id
         LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
         LEFT JOIN disponibilidad d ON d.socio_id = s.id
         ${where}`,
        params
      );
      res.json({ destinatarios: result.rows[0].total });
    } catch (error) {
      console.error('Error preview comunicación:', error);
      res.status(500).json({ error: 'No se pudo calcular la preview' });
    }
  }

  // POST /api/admin/comunicaciones/enviar — envía un email a todos los
  // socios que cumplen los filtros. Uso: comunicados de Gerencia, avisos
  // de eventos, cambios de política. Uno por uno en background.
  async enviarComunicacion(req, res) {
    try {
      const { asunto, cuerpo, filtros } = req.body || {};
      if (!asunto || asunto.trim().length < 3) {
        return res.status(400).json({ error: 'El asunto es obligatorio' });
      }
      if (!cuerpo || cuerpo.trim().length < 10) {
        return res.status(400).json({ error: 'El cuerpo del mensaje es demasiado corto' });
      }
      const { where, params } = buildSocioFilterWhere(filtros || {});
      const dests = await db.query(
        `SELECT DISTINCT s.id, s.email, s.nombre
         FROM socios s
         JOIN consentimientos c ON c.socio_id = s.id
         LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
         LEFT JOIN disponibilidad d ON d.socio_id = s.id
         ${where}`,
        params
      );
      const adminId = req.adminId;
      const emailService = require('../services/emailService');

      // Devolvemos ya al admin y disparamos envíos en background.
      res.json({
        message: 'Comunicación en cola',
        destinatarios: dests.rows.length,
      });

      // Auditar el disparo
      try {
        await auditAction(null, adminId, 'SEND_MASS_COMMUNICATION', 'socios',
          null, { destinatarios: dests.rows.length, asunto }, req);
      } catch (_) { /* no bloquear */ }

      // Envío en background — no bloquea la respuesta
      const html = '<div style="font-family:Arial,sans-serif;color:#333;line-height:1.5">' +
        '<p>' + String(cuerpo).replace(/\n/g, '<br>') + '</p>' +
        '<hr><p style="font-size:.85em;color:#666">AGESPORT · Mapa del Talento</p>' +
      '</div>';
      setImmediate(function () {
        (async function () {
          for (const d of dests.rows) {
            try {
              const personalized = html.replace(/\{nombre\}/g, d.nombre || 'socio');
              await emailService.sendEmail(d.email, asunto, personalized);
            } catch (e) {
              console.warn('[mass-comm] fallo para', d.email, ':', e.message);
            }
          }
        })();
      });
    } catch (error) {
      console.error('Error enviando comunicación:', error);
      res.status(500).json({ error: 'No se pudo enviar la comunicación' });
    }
  }

  // POST /api/admin/socios/:socioId/reset-password — reset password del socio
  // (envía email con enlace, mismo flujo que "he olvidado mi contraseña").
  async resetSocioPassword(req, res) {
    try {
      const id = parseInt(req.params.socioId);
      const target = await db.findOne('socios', { id });
      if (!target) return res.status(404).json({ error: 'Socio no encontrado' });
      const crypto = require('crypto');
      const raw = crypto.randomBytes(32).toString('hex');
      const hash = crypto.createHash('sha256').update(raw).digest('hex');
      await db.query(
        `INSERT INTO password_reset_tokens (socio_id, token_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [id, hash]
      );
      const base = require('../config/config').app.publicBaseUrl.replace(/\/$/, '');
      const resetUrl = `${base || 'http://localhost:3001'}/restablecer.html?token=${raw}`;
      try {
        const emailService = require('../services/emailService');
        const delivery = await emailService.sendPasswordReset(
          { email: target.email, nombre: target.nombre },
          { resetUrl, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
        );
        if (!delivery?.success) return res.status(502).json({error:delivery?.error || 'No se pudo enviar el correo de recuperación'});
      } catch (_) { return res.status(502).json({error:'No se pudo enviar el correo de recuperación'}); }
      await auditAction(null, req.adminId, 'ADMIN_RESET_SOCIO_PASSWORD_REQUEST',
        'socios', null, { target_id: id, target_email: target.email }, req);
      res.json({ message: 'Correo de recuperación aceptado por el servidor de envío para ' + target.email });
    } catch (error) {
      console.error('Error reset socio password:', error);
      res.status(500).json({ error: 'No se pudo iniciar el reseteo' });
    }
  }
}

module.exports = new AdminController();
