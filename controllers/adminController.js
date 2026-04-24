// controllers/adminController.js
const db = require('../config/database');
const { auditAction, hashPassword } = require('../middleware/auth');
const emailService = require('../services/emailService');

class AdminController {

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
               ), ARRAY[]::especialidad_enum[]) as especialidades
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
      await emailService.notifySocioApproved({
        email: socio.email,
        nombre: socio.nombre,
        apellidos: socio.apellidos
      });

      // Auditar aprobación
      await auditAction(socioId, req.adminId, 'APPROVE_SOCIO', 'socios', socio, { estado: 'aprobado', notas }, req);

      res.json({ 
        message: `Socio ${socio.nombre} ${socio.apellidos} aprobado correctamente`,
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

      query += ` ORDER BY a.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      const offset = (page - 1) * limit;
      params.push(limit, offset);

      const auditoria = await db.query(query, params);

      res.json({
        auditoria: auditoria.rows,
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
}

module.exports = new AdminController();
