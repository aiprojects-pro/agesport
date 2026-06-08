// controllers/mensajeriaController.js
const db = require('../config/database');
const { auditAction } = require('../middleware/auth');
const emailService = require('../services/emailService');
const sentinels = require('../services/messageSentinels');

class MensajeriaController {
  constructor() {
    this.enviarMensaje = this.enviarMensaje.bind(this);
    this.enviarMensajeMulti = this.enviarMensajeMulti.bind(this);
    this.iniciarConversacion = this.iniciarConversacion.bind(this);
    this._persistMessage = this._persistMessage.bind(this);
    this._sendOne = this._sendOne.bind(this);
  }

  // ==================== HELPERS INTERNOS ====================

  // Persiste un mensaje (encuentra o crea la conversación) en una transacción.
  // Devuelve el id de la conversación.
  async _persistMessage(emisorId, receptorId, contenido) {
    return await db.transaction(async (client) => {
      const socio1 = Math.min(emisorId, receptorId);
      const socio2 = Math.max(emisorId, receptorId);

      let conv = await client.query(
        'SELECT id FROM conversaciones WHERE socio_1_id = $1 AND socio_2_id = $2',
        [socio1, socio2]
      );
      if (conv.rows.length === 0) {
        conv = await client.query(
          'INSERT INTO conversaciones (socio_1_id, socio_2_id) VALUES ($1, $2) RETURNING id',
          [socio1, socio2]
        );
      }
      const conversacionId = conv.rows[0].id;

      await client.query(
        'INSERT INTO mensajes (conversacion_id, emisor_id, receptor_id, contenido) VALUES ($1, $2, $3, $4)',
        [conversacionId, emisorId, receptorId, contenido]
      );
      await client.query('UPDATE conversaciones SET updated_at = NOW() WHERE id = $1', [
        conversacionId,
      ]);
      return conversacionId;
    });
  }

  // Envía un mensaje a un receptor: valida, persiste y notifica.
  // Devuelve { ok: true } o { ok: false, code, error }.
  async _sendOne(emisorId, emisor, receptorIdRaw, contenido, notifyEmail) {
    const rid = parseInt(receptorIdRaw);
    if (!rid || rid === emisorId) {
      return { ok: false, code: 400, error: 'Receptor inválido' };
    }

    const receptor = await db.findOne('socios', { id: rid, estado: 'aprobado', activo: true });
    if (!receptor) {
      return { ok: false, code: 404, error: 'Receptor no encontrado o inactivo' };
    }

    const consents = await db.findOne('consentimientos', { socio_id: rid });
    if (!consents || !consents.acepta_mensajeria) {
      return { ok: false, code: 403, error: 'Este socio no acepta mensajes privados' };
    }

    await this._persistMessage(emisorId, rid, contenido);

    if (notifyEmail && consents.acepta_notificaciones_email) {
      try {
        await emailService.notifyNewMessage(
          { email: receptor.email, nombre: receptor.nombre, acepta_notificaciones_email: true },
          { nombre: emisor.nombre, apellidos: emisor.apellidos },
          contenido
        );
      } catch (e) {
        console.warn('[email] notifyNewMessage failed:', e.message);
      }
    }
    return { ok: true };
  }

  // ==================== OBTENER CONVERSACIONES ====================
  
  async getConversaciones(req, res) {
    try {
      const socioId = req.socioId;
      
      const conversaciones = await db.query(`
        SELECT 
          c.id as conversacion_id,
          CASE 
            WHEN c.socio_1_id = $1 THEN c.socio_2_id 
            ELSE c.socio_1_id 
          END as otro_socio_id,
          CASE 
            WHEN c.socio_1_id = $1 THEN s2.nombre || ' ' || s2.apellidos
            ELSE s1.nombre || ' ' || s1.apellidos  
          END as otro_socio_nombre,
          CASE 
            WHEN c.socio_1_id = $1 THEN s2.provincia
            ELSE s1.provincia
          END as otro_socio_provincia,
          CASE 
            WHEN c.socio_1_id = $1 THEN s2.entidad
            ELSE s1.entidad
          END as otro_socio_entidad,
          c.updated_at as ultima_actividad,
          
          -- Último mensaje
          (SELECT contenido FROM mensajes WHERE conversacion_id = c.id ORDER BY created_at DESC LIMIT 1) as ultimo_mensaje,
          (SELECT created_at FROM mensajes WHERE conversacion_id = c.id ORDER BY created_at DESC LIMIT 1) as ultimo_mensaje_fecha,
          (SELECT emisor_id FROM mensajes WHERE conversacion_id = c.id ORDER BY created_at DESC LIMIT 1) as ultimo_emisor_id,
          
          -- Mensajes no leídos
          (SELECT COUNT(*) FROM mensajes WHERE conversacion_id = c.id AND receptor_id = $1 AND leido = false) as no_leidos
          
        FROM conversaciones c
        JOIN socios s1 ON c.socio_1_id = s1.id
        JOIN socios s2 ON c.socio_2_id = s2.id
        WHERE (c.socio_1_id = $1 OR c.socio_2_id = $1)
          AND s1.estado = 'aprobado' AND s1.activo = true
          AND s2.estado = 'aprobado' AND s2.activo = true
        ORDER BY ultima_actividad DESC
      `, [socioId]);

      res.json({ conversaciones: conversaciones.rows });

    } catch (error) {
      console.error('Error obteniendo conversaciones:', error);
      res.status(500).json({ error: 'Error obteniendo conversaciones' });
    }
  }

  // ==================== OBTENER MENSAJES DE UNA CONVERSACIÓN ====================
  
  async getMensajes(req, res) {
    try {
      const { conversacionId } = req.params;
      const socioId = req.socioId;

      // Verificar que el socio pertenece a esta conversación
      const conversacion = await db.findOne('conversaciones', {
        id: conversacionId
      });

      if (!conversacion) {
        return res.status(404).json({ error: 'Conversación no encontrada' });
      }

      if (conversacion.socio_1_id !== socioId && conversacion.socio_2_id !== socioId) {
        return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
      }

      // Obtener mensajes
      const mensajes = await db.query(`
        SELECT m.id, m.contenido, m.emisor_id, m.receptor_id, m.leido, 
               m.created_at, m.reportado,
               e.nombre as emisor_nombre, e.apellidos as emisor_apellidos
        FROM mensajes m
        JOIN socios e ON m.emisor_id = e.id
        WHERE m.conversacion_id = $1
          AND m.contenido != $2
        ORDER BY m.created_at ASC
      `, [conversacionId]);

      // Marcar mensajes como leídos
      await db.query(`
        UPDATE mensajes 
        SET leido = true, fecha_lectura = NOW()
        WHERE conversacion_id = $1 AND receptor_id = $2 AND leido = false
      `, [conversacionId, socioId]);

      // Actualizar timestamp de conversación
      await db.update('conversaciones', { updated_at: new Date() }, { id: conversacionId });

      // Auditar lectura de mensajes
      await auditAction(socioId, null, 'READ_MESSAGES', 'mensajes', null, { 
        conversacion_id: conversacionId 
      }, req);

      res.json({ 
        conversacion_id: conversacionId,
        mensajes: mensajes.rows 
      });

    } catch (error) {
      console.error('Error obteniendo mensajes:', error);
      res.status(500).json({ error: 'Error obteniendo mensajes' });
    }
  }

  // ==================== ENVIAR MENSAJE MULTI-RECEPTOR ====================

  async enviarMensajeMulti(req, res) {
    try {
      const { receptorIds, contenido, notificarPorEmail } = req.body;
      const emisorId = req.socioId;

      if (!Array.isArray(receptorIds) || receptorIds.length === 0) {
        return res.status(400).json({ error: 'Lista de receptores requerida' });
      }
      if (!contenido || contenido.trim().length < 1 || contenido.length > 1000) {
        return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 1000 caracteres' });
      }

      const uniqIds = Array.from(new Set(receptorIds.map(Number).filter(Boolean))).filter(
        (id) => id !== emisorId
      );

      const emisor = await db.findOne('socios', { id: emisorId });
      const trimmed = contenido.trim();
      const resultados = [];
      for (const rid of uniqIds) {
        try {
          const r = await this._sendOne(emisorId, emisor, rid, trimmed, !!notificarPorEmail);
          resultados.push({ id: rid, ok: r.ok, error: r.error });
        } catch (err) {
          console.error('Error multi-mensaje a ' + rid, err);
          resultados.push({ id: rid, ok: false, error: err.message });
        }
      }

      await auditAction(
        emisorId,
        null,
        'SEND_MULTI_MESSAGE',
        'mensajes',
        null,
        { receptorIds: uniqIds, sent: resultados.filter((r) => r.ok).length },
        req
      );

      res.status(201).json({
        message: 'Envío procesado',
        enviados: resultados.filter((r) => r.ok).length,
        total: uniqIds.length,
        resultados,
      });
    } catch (error) {
      console.error('Error enviando mensaje multi:', error);
      res.status(500).json({ error: 'Error enviando mensaje multi-receptor' });
    }
  }

  // ==================== ENVIAR MENSAJE (un receptor) ====================

  async enviarMensaje(req, res) {
    try {
      const { receptorId, contenido, notificarPorEmail } = req.body;
      const emisorId = req.socioId;

      if (!receptorId || !contenido) {
        return res.status(400).json({ error: 'Receptor y contenido son requeridos' });
      }
      if (contenido.trim().length < 1 || contenido.length > 1000) {
        return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 1000 caracteres' });
      }

      const emisor = await db.findOne('socios', { id: emisorId });
      const notify = notificarPorEmail === undefined ? true : !!notificarPorEmail;
      const r = await this._sendOne(emisorId, emisor, receptorId, contenido.trim(), notify);
      if (!r.ok) return res.status(r.code).json({ error: r.error });

      await auditAction(
        emisorId,
        null,
        'SEND_MESSAGE',
        'mensajes',
        null,
        {
          receptor_id: receptorId,
          preview: contenido.substring(0, 50) + (contenido.length > 50 ? '...' : ''),
        },
        req
      );

      res.status(201).json({
        message: 'Mensaje enviado correctamente',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      res.status(500).json({ error: 'Error enviando mensaje' });
    }
  }

  // ==================== INICIAR CONVERSACIÓN ====================
  
  async iniciarConversacion(req, res) {
    try {
      const { receptorId, mensaje } = req.body;
      const emisorId = req.socioId;

      if (!receptorId) {
        return res.status(400).json({ error: 'ID del receptor es requerido' });
      }

      // Verificar si ya existe una conversación
      const socio1 = Math.min(emisorId, receptorId);
      const socio2 = Math.max(emisorId, receptorId);

      const conversacionExistente = await db.findOne('conversaciones', {
        socio_1_id: socio1,
        socio_2_id: socio2
      });

      if (conversacionExistente) {
        return res.json({
          message: 'Conversación ya existe',
          conversacion_id: conversacionExistente.id,
          exists: true
        });
      }

      // Verificar que puede contactar con este socio
      const receptor = await db.findOne('socios', { 
        id: receptorId, 
        estado: 'aprobado', 
        activo: true 
      });

      if (!receptor) {
        return res.status(404).json({ error: 'Socio no encontrado' });
      }

      const consentimientos = await db.findOne('consentimientos', { socio_id: receptorId });
      if (!consentimientos || !consentimientos.acepta_mensajeria) {
        return res.status(403).json({ 
          error: 'Este socio no acepta mensajes privados' 
        });
      }

      // Crear conversación
      const nuevaConversacion = await db.insert('conversaciones', {
        socio_1_id: socio1,
        socio_2_id: socio2
      });

      // Si hay mensaje inicial, persistirlo en la conversación recién creada
      if (mensaje && mensaje.trim()) {
        await db.insert('mensajes', {
          conversacion_id: nuevaConversacion.id,
          emisor_id: emisorId,
          receptor_id: receptorId,
          contenido: mensaje.trim(),
        });
        await db.update(
          'conversaciones',
          { updated_at: new Date() },
          { id: nuevaConversacion.id }
        );
      }

      res.status(201).json({
        message: 'Conversación iniciada',
        conversacion_id: nuevaConversacion.id,
        receptor: {
          id: receptor.id,
          nombre: receptor.nombre,
          apellidos: receptor.apellidos
        }
      });

    } catch (error) {
      console.error('Error iniciando conversación:', error);
      res.status(500).json({ error: 'Error iniciando conversación' });
    }
  }

  // ==================== REPORTAR MENSAJE ====================
  
  async reportarMensaje(req, res) {
    try {
      const { mensajeId } = req.params;
      const { motivo } = req.body;
      const reporterId = req.socioId;

      if (!motivo || motivo.trim().length < 5) {
        return res.status(400).json({ error: 'Motivo del reporte es requerido (mínimo 5 caracteres)' });
      }

      // Verificar que el mensaje existe y el usuario puede reportarlo
      const mensaje = await db.query(`
        SELECT m.*, c.socio_1_id, c.socio_2_id
        FROM mensajes m
        JOIN conversaciones c ON m.conversacion_id = c.id
        WHERE m.id = $1
      `, [mensajeId]);

      if (mensaje.rows.length === 0) {
        return res.status(404).json({ error: 'Mensaje no encontrado' });
      }

      const msg = mensaje.rows[0];

      // Solo puede reportar si participa en la conversación y no es el emisor
      if ((msg.socio_1_id !== reporterId && msg.socio_2_id !== reporterId) || msg.emisor_id === reporterId) {
        return res.status(403).json({ error: 'No puedes reportar este mensaje' });
      }

      // Marcar como reportado
      await db.update('mensajes', {
        reportado: true,
        motivo_moderacion: `REPORTADO POR SOCIO ${reporterId}: ${motivo.trim()}`
      }, { id: mensajeId });

      // Auditar reporte
      await auditAction(reporterId, null, 'REPORT_MESSAGE', 'mensajes', msg, { motivo }, req);

      res.json({ 
        message: 'Mensaje reportado. Será revisado por la moderación de AGESPORT.',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error reportando mensaje:', error);
      res.status(500).json({ error: 'Error reportando mensaje' });
    }
  }

  // ==================== ESTADÍSTICAS DE MENSAJERÍA ====================
  
  async getEstadisticasMensajeria(req, res) {
    try {
      const socioId = req.socioId;

      const stats = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM conversaciones WHERE socio_1_id = $1 OR socio_2_id = $1) as total_conversaciones,
          (SELECT COUNT(*) FROM mensajes WHERE emisor_id = $1) as mensajes_enviados,
          (SELECT COUNT(*) FROM mensajes WHERE receptor_id = $1) as mensajes_recibidos,
          (SELECT COUNT(*) FROM mensajes WHERE receptor_id = $1 AND leido = false) as mensajes_no_leidos,
          (SELECT COUNT(*) FROM mensajes WHERE emisor_id = $1 AND created_at > NOW() - INTERVAL '30 days') as mensajes_este_mes
      `, [socioId]);

      res.json({ estadisticas: stats.rows[0] });

    } catch (error) {
      console.error('Error obteniendo estadísticas mensajería:', error);
      res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
  }

  // ==================== MARCAR CONVERSACIÓN COMO LEÍDA ====================
  
  async marcarComoLeida(req, res) {
    try {
      const { conversacionId } = req.params;
      const socioId = req.socioId;

      // Verificar acceso a la conversación
      const conversacion = await db.findOne('conversaciones', { id: conversacionId });
      if (!conversacion || (conversacion.socio_1_id !== socioId && conversacion.socio_2_id !== socioId)) {
        return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
      }

      // Marcar mensajes como leídos
      const result = await db.query(`
        UPDATE mensajes 
        SET leido = true, fecha_lectura = NOW()
        WHERE conversacion_id = $1 AND receptor_id = $2 AND leido = false
        RETURNING id
      `, [conversacionId, socioId]);

      res.json({ 
        message: 'Conversación marcada como leída',
        mensajes_marcados: result.rows.length
      });

    } catch (error) {
      console.error('Error marcando como leída:', error);
      res.status(500).json({ error: 'Error marcando conversación como leída' });
    }
  }
}

module.exports = new MensajeriaController();
