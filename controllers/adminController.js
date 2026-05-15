// controllers/adminController.js
const db = require('../config/database');
const { auditAction, hashPassword } = require('../middleware/auth');
const emailService = require('../services/emailService');
const uploadService = require('../services/uploadService');
const catalogos = require('../config/catalogos');
const crypto = require('crypto');

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
    const header = [
      'nombre','apellidos','email','telefono','entidad','cargo_actual',
      'provincia','comunidad_autonoma','rol_cluster','tipo_socio'
    ];
    const ejemplo = [
      'María','García López','maria.garcia@ejemplo.com','+34 600 000 000',
      'Club Deportivo Demo','Directora deportiva',
      'Sevilla','andalucia','operador_deportivo','numero'
    ];
    const csv = header.join(',') + '\n' + ejemplo.map(function (v) {
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',') + '\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-socios-agesport.csv"');
    res.send(csv);
  }

  async importarCSV(req, res) {
    try {
      const adminId = req.adminId;
      if (!req.file) return res.status(400).json({ error: 'No se ha recibido ningún fichero' });

      const buffer = req.file.buffer.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
      if (lines.length < 2) return res.status(400).json({ error: 'El CSV está vacío' });

      const parseLine = function (line) {
        const out = [];
        let curr = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"' && line[i + 1] === '"') { curr += '"'; i++; continue; }
          if (ch === '"') { inQuotes = !inQuotes; continue; }
          if (ch === ',' && !inQuotes) { out.push(curr); curr = ''; continue; }
          curr += ch;
        }
        out.push(curr);
        return out;
      };

      const header = parseLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
      const loteId = crypto.randomUUID ? crypto.randomUUID() : require('crypto').randomBytes(16).toString('hex');
      const filas = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);
        const r = {};
        header.forEach(function (h, idx) { r[h] = (cols[idx] || '').trim() || null; });
        const errores = [];
        if (!r.email) errores.push('Email vacío');
        if (r.provincia && !catalogos.isValidProvincia(r.provincia)) errores.push('Provincia no válida');
        if (r.rol_cluster && !catalogos.isValidRolSlug(r.rol_cluster)) errores.push('Rol no válido');
        if (r.tipo_socio && !catalogos.isValidTipoSocio(r.tipo_socio)) errores.push('Tipo de socio no válido');
        const ccaa = r.comunidad_autonoma || (r.provincia ? (catalogos.findCcaaByProvincia(r.provincia) || {}).slug : null);

        let estado = errores.length ? 'pendiente' : 'pendiente';
        if (r.email) {
          const exists = await db.findOne('socios', { email: r.email });
          if (exists) { estado = 'duplicado'; errores.push('Email ya existente en socios'); }
        }

        const inserted = await db.insert('accesos_invitados', {
          lote_id: loteId,
          nombre: r.nombre,
          apellidos: r.apellidos,
          email: r.email,
          telefono: r.telefono,
          entidad: r.entidad,
          cargo_actual: r.cargo_actual,
          provincia: r.provincia,
          comunidad_autonoma: ccaa,
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
      res.status(500).json({ error: 'Error importando CSV' });
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

  async aprobarAccesoInvitado(req, res) {
    try {
      const { invitadoId } = req.params;
      const adminId = req.adminId;
      const invitado = await db.findOne('accesos_invitados', { id: invitadoId });
      if (!invitado) return res.status(404).json({ error: 'Invitado no encontrado' });
      if (invitado.estado !== 'pendiente') return res.status(409).json({ error: 'El invitado ya ha sido procesado' });

      // Crear contraseña aleatoria temporal y socio aprobado
      const tempPass = require('crypto').randomBytes(8).toString('base64').slice(0, 12) + 'A1!';
      const passwordHash = await hashPassword(tempPass);

      const result = await db.query(`
        INSERT INTO socios (
          email, password_hash, nombre, apellidos, telefono, entidad,
          cargo_actual, provincia, comunidad_autonoma, tipo_socio, estado, activo
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'aprobado', true)
        RETURNING id, email, nombre
      `, [
        invitado.email,
        passwordHash,
        invitado.nombre || 'Socio',
        invitado.apellidos || '',
        invitado.telefono,
        invitado.entidad,
        invitado.cargo_actual,
        invitado.provincia,
        invitado.comunidad_autonoma,
        invitado.tipo_socio || 'numero'
      ]);

      const nuevoSocio = result.rows[0];

      if (invitado.rol_cluster) {
        await db.query('INSERT INTO rol_cluster (socio_id, rol) VALUES ($1, $2)', [nuevoSocio.id, invitado.rol_cluster]);
      }

      await db.update('accesos_invitados', {
        estado: 'aprobado',
        socio_creado_id: nuevoSocio.id,
        fecha_resolucion: new Date()
      }, { id: invitadoId });

      // Notificar al socio por email
      try {
        const adminRow = await db.findOne('administradores', { id: adminId });
        await emailService.sendAccountApproved(
          { email: nuevoSocio.email, nombre: nuevoSocio.nombre },
          { passwordTemporal: tempPass, adminNombre: adminRow ? adminRow.nombre : 'AGESPORT' }
        );
      } catch (e) { console.warn('Email invitación falló:', e.message); }

      await auditAction(null, adminId, 'APPROVE_INVITED', 'accesos_invitados', invitado, { socio_id: nuevoSocio.id }, req);
      res.json({ message: 'Acceso aprobado y notificado', socio_id: nuevoSocio.id });
    } catch (error) {
      console.error('Error aprobando invitado:', error);
      res.status(500).json({ error: 'Error aprobando invitado' });
    }
  }

  // =============================================================
  // ==================== ACCESOS GENERADOS ======================
  // =============================================================

  async getAccesosGenerados(req, res) {
    try {
      const result = await db.query(`
        SELECT s.id, s.email, s.nombre, s.apellidos, s.entidad, s.provincia,
               s.comunidad_autonoma, s.tipo_socio, s.estado, s.activo,
               s.ultimo_acceso, s.fecha_registro
        FROM socios s
        WHERE s.estado = 'aprobado' AND s.activo = true
        ORDER BY s.ultimo_acceso DESC NULLS LAST, s.fecha_registro DESC
        LIMIT 500
      `);
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
          s.telefono,
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
          rc.rol AS rol_cluster,
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
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        if (/[",\n\r]/.test(s)) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

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
        'Visible teléfono', 'Visible email directo'
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
          r.telefono,
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
          fmtBool(r.visible_email_directo)
        ].map(escapeCSV).join(',');
      });

      // BOM UTF-8 para que Excel/Numbers detecten encoding y acentos
      const bom = '\uFEFF';
      const csv = bom + header.map(escapeCSV).join(',') + '\n' + rows.join('\n') + '\n';

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
      res.send(csv);
    } catch (error) {
      console.error('Error exportando CSV:', error);
      res.status(500).json({ error: 'Error generando la exportación CSV' });
    }
  }
}

module.exports = new AdminController();
