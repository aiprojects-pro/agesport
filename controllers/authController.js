// controllers/authController.js
const crypto = require('crypto');
const {
  generateToken,
  generateRefreshToken,
  hashPassword,
  comparePassword,
  encryptData,
  auditAction
} = require('../middleware/auth');
const db = require('../config/database');
const config = require('../config/config');
const geocodingService = require('../services/geocodingService');
const emailService = require('../services/emailService');
const catalogos = require('../config/catalogos');

// Genera un token de reset (32 bytes hex en claro + su SHA-256 para BD).
// El token en claro sólo viaja al usuario; en BD nunca se guarda en claro.
function generateResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

// Base URL siempre desde config (NO desde req.get('host') — controlable
// por cliente vía Host header → reset link a dominio del atacante).
function resolveBaseUrl() {
  return config.app.publicBaseUrl;
}

class AuthController {

  // ==================== REGISTRO DE SOCIO ====================
  
  async register(req, res) {
    try {
      const {
        // Datos personales
        email, password, nombre, apellidos, dni_nie, telefono, 
        linkedin_url, otras_redes,

        // v2: campos nuevos
        tipo_socio, email_personal, email_preferido, nombre_organizacion,
        comunidad_autonoma,

        // Datos profesionales
        entidad, web_profesional, provincia, localidad, codigo_postal,
        direccion_completa, ambito, cargo_actual, anos_experiencia,
        
        // Rol en el clúster
        rol_cluster, b2b_ofrece, b2b_busca, b2b_licita,
        
        // Especialidades (array)
        especialidades,
        
        // Disponibilidad
        disponibilidad, ponente, tutor_mentor, asistente,
        congreso_almeria, representacion, captacion_patrocinio,
        
        // Proyecto innovación
        proyecto_descripcion, proyecto_tecnologias, proyecto_impacto,
        
        // Consentimientos
        acepta_mapa_interactivo, acepta_visibilidad_datos,
        acepta_mensajeria, acepta_notificaciones_email,
        visible_telefono, visible_email_directo, visible_web_profesional, visible_linkedin
      } = req.body;

      // Inferir CCAA si nos dieron solo la provincia
      let ccaa = comunidad_autonoma;
      if (!ccaa && provincia) {
        const found = catalogos.findCcaaByProvincia(provincia);
        if (found) ccaa = found.slug;
      }

      // Verificar si el email ya existe
      const existingSocio = await db.findOne('socios', { email });
      if (existingSocio) {
        return res.status(400).json({ 
          error: 'Ya existe un socio registrado con este email' 
        });
      }

      // Hash de la contraseña
      const passwordHash = await hashPassword(password);

      // Cifrar datos sensibles
      const dniEncrypted = dni_nie ? encryptData(dni_nie) : null;
      const telefonoEncrypted = telefono ? encryptData(telefono) : null;

      // Geocodificar dirección
      let latitud = null, longitud = null;
      if (direccion_completa && provincia && localidad) {
        try {
          const coords = await geocodingService.geocode(
            `${direccion_completa}, ${localidad}, ${provincia}, España`
          );
          if (coords) {
            latitud = coords.lat;
            longitud = coords.lng;
          }
        } catch (geoError) {
          console.warn('[geocode] register: could not geocode address:', geoError.message);
        }
      }

      // Usar transacción para crear socio completo
      const nuevoSocio = await db.transaction(async (client) => {

        // 1. Crear socio principal
        const socioResult = await client.query(`
          INSERT INTO socios (
            email, email_personal, email_preferido, password_hash,
            nombre, apellidos, tipo_socio, nombre_organizacion,
            dni_nie_encrypted, telefono_encrypted,
            linkedin_url, otras_redes, entidad, web_profesional,
            provincia, comunidad_autonoma, localidad,
            codigo_postal, direccion_completa, ambito, cargo_actual, anos_experiencia,
            latitud, longitud, estado
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
          RETURNING id, email, nombre, apellidos
        `, [
          email,
          email_personal || null,
          email_preferido || 'profesional',
          passwordHash,
          nombre,
          apellidos,
          tipo_socio || 'numero',
          nombre_organizacion || null,
          dniEncrypted,
          telefonoEncrypted,
          linkedin_url || null,
          otras_redes || null,
          entidad || null,
          web_profesional || null,
          provincia,
          ccaa || null,
          localidad,
          codigo_postal || null,
          direccion_completa || null,
          ambito || null,
          cargo_actual || null,
          anos_experiencia || 0,
          latitud,
          longitud,
          'pendiente'
        ]);

        const socio = socioResult.rows[0];

        // 2. Crear rol en el clúster
        if (rol_cluster) {
          await client.query(`
            INSERT INTO rol_cluster (socio_id, rol, b2b_ofrece, b2b_busca, b2b_licita)
            VALUES ($1, $2, $3, $4, $5)
          `, [socio.id, rol_cluster, !!b2b_ofrece, !!b2b_busca, !!b2b_licita]);
        }

        // 3. Crear especialidades
        if (especialidades && Array.isArray(especialidades)) {
          for (let i = 0; i < especialidades.length; i++) {
            await client.query(`
              INSERT INTO socio_especialidades (socio_id, especialidad, orden_prioridad)
              VALUES ($1, $2, $3)
            `, [socio.id, especialidades[i], (i % 3) + 1]); // orden_prioridad cíclico 1-3
          }
        }

        // 4. Crear disponibilidad
        if (disponibilidad) {
          await client.query(`
            INSERT INTO disponibilidad (
              socio_id, nivel, ponente, tutor_mentor, asistente,
              congreso_almeria, representacion, captacion_patrocinio
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            socio.id, disponibilidad, !!ponente, !!tutor_mentor, !!asistente,
            !!congreso_almeria, !!representacion, !!captacion_patrocinio
          ]);
        }

        // 5. Crear proyecto de innovación (si existe)
        if (proyecto_descripcion) {
          await client.query(`
            INSERT INTO proyectos_innovacion (socio_id, descripcion, tecnologias, impacto)
            VALUES ($1, $2, $3, $4)
          `, [socio.id, proyecto_descripcion, proyecto_tecnologias, proyecto_impacto]);
        }

        // 6. Registrar consentimientos RGPD
        await client.query(`
          INSERT INTO consentimientos (
            socio_id, acepta_mapa_interactivo, acepta_visibilidad_datos,
            acepta_mensajeria, acepta_notificaciones_email,
            visible_telefono, visible_email_directo, visible_web_profesional, visible_linkedin,
            ip_consentimiento, user_agent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          socio.id, !!acepta_mapa_interactivo, !!acepta_visibilidad_datos,
          !!acepta_mensajeria, !!acepta_notificaciones_email,
          !!visible_telefono, !!visible_email_directo, !!visible_web_profesional, !!visible_linkedin,
          req.ip, req.get('User-Agent')
        ]);

        return socio;
      });

      // Notificar a administradores
      try { await emailService.notifyAdminNewRegistration(nuevoSocio); } catch (e) { console.warn('Email admin:', e.message); }

      // Auditar registro
      await auditAction(nuevoSocio.id, null, 'REGISTER', 'socios', null, nuevoSocio, req);

      res.status(201).json({
        message: 'Registro completado. Tu solicitud está pendiente de aprobación por parte de la Gerencia de AGESPORT.',
        socio: {
          id: nuevoSocio.id,
          nombre: nuevoSocio.nombre,
          apellidos: nuevoSocio.apellidos,
          email: nuevoSocio.email,
          estado: 'pendiente'
        }
      });

    } catch (error) {
      console.error('Error en registro:', error);
      res.status(500).json({
        error: 'Error interno del servidor durante el registro'
      });
    }
  }

  // ==================== LOGIN DE SOCIO ====================
  
  async loginSocio(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          error: 'Email y contraseña son requeridos' 
        });
      }

      // Buscar socio
      const socio = await db.findOne('socios', { email, activo: true });
      if (!socio) {
        await auditAction(null, null, 'LOGIN_FAILED', 'socios', null, { email, reason: 'socio_not_found' }, req);
        return res.status(401).json({ 
          error: 'Credenciales inválidas' 
        });
      }

      // Verificar contraseña
      const validPassword = await comparePassword(password, socio.password_hash);
      if (!validPassword) {
        await auditAction(socio.id, null, 'LOGIN_FAILED', 'socios', null, { reason: 'invalid_password' }, req);
        return res.status(401).json({ 
          error: 'Credenciales inválidas' 
        });
      }

      // Verificar estado del socio
      if (socio.estado === 'pendiente') {
        return res.status(403).json({ 
          error: 'Tu cuenta está pendiente de aprobación por parte de AGESPORT' 
        });
      } else if (socio.estado === 'rechazado') {
        return res.status(403).json({ 
          error: 'Tu solicitud de registro ha sido rechazada' 
        });
      } else if (socio.estado === 'suspendido') {
        return res.status(403).json({ 
          error: 'Tu cuenta ha sido suspendida temporalmente' 
        });
      }

      // Generar tokens
      const tokenPayload = { 
        socioId: socio.id, 
        email: socio.email, 
        type: 'socio' 
      };
      const token = generateToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload);

      // Actualizar último acceso
      await db.update('socios', { ultimo_acceso: new Date() }, { id: socio.id });

      // Configurar cookies seguras
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 días
      };

      res.cookie('token', token, cookieOptions);
      res.cookie('refreshToken', refreshToken, { 
        ...cookieOptions, 
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
      });

      // Auditar login exitoso
      await auditAction(socio.id, null, 'LOGIN_SUCCESS', 'socios', null, null, req);

      res.json({
        message: 'Inicio de sesión exitoso',
        socio: {
          id: socio.id,
          nombre: socio.nombre,
          apellidos: socio.apellidos,
          email: socio.email,
          provincia: socio.provincia
        },
        token // Para clientes que no usen cookies
      });

    } catch (error) {
      console.error('Error en login de socio:', error);
      res.status(500).json({ 
        error: 'Error interno del servidor' 
      });
    }
  }

  // ==================== LOGIN DE ADMINISTRADOR ====================
  
  async loginAdmin(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ 
          error: 'Email y contraseña son requeridos' 
        });
      }

      // Buscar administrador
      const admin = await db.findOne('administradores', { email, activo: true });
      if (!admin) {
        await auditAction(null, null, 'ADMIN_LOGIN_FAILED', 'administradores', null, { email, reason: 'admin_not_found' }, req);
        return res.status(401).json({ 
          error: 'Credenciales de administrador inválidas' 
        });
      }

      // Verificar contraseña
      const validPassword = await comparePassword(password, admin.password_hash);
      if (!validPassword) {
        await auditAction(null, admin.id, 'ADMIN_LOGIN_FAILED', 'administradores', null, { reason: 'invalid_password' }, req);
        return res.status(401).json({ 
          error: 'Credenciales de administrador inválidas' 
        });
      }

      // Generar token de admin
      const tokenPayload = { 
        adminId: admin.id, 
        email: admin.email, 
        rol: admin.rol,
        type: 'admin' 
      };
      const token = generateToken(tokenPayload);

      // Actualizar último acceso
      await db.update('administradores', { ultimo_acceso: new Date() }, { id: admin.id });

      // Configurar cookie segura
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000 // 8 horas (más corto que socios)
      };

      res.cookie('adminToken', token, cookieOptions);

      // Auditar login exitoso
      await auditAction(null, admin.id, 'ADMIN_LOGIN_SUCCESS', 'administradores', null, null, req);

      res.json({
        message: 'Inicio de sesión de administrador exitoso',
        admin: {
          id: admin.id,
          nombre: admin.nombre,
          email: admin.email,
          rol: admin.rol
        },
        token // Para clientes que no usen cookies
      });

    } catch (error) {
      console.error('Error en login de admin:', error);
      res.status(500).json({ 
        error: 'Error interno del servidor' 
      });
    }
  }

  // ==================== LOGOUT ====================
  
  async logout(req, res) {
    try {
      // Limpiar cookies
      res.clearCookie('token');
      res.clearCookie('refreshToken');
      res.clearCookie('adminToken');

      // Auditar logout
      if (req.socioId) {
        await auditAction(req.socioId, null, 'LOGOUT', 'socios', null, null, req);
      } else if (req.adminId) {
        await auditAction(null, req.adminId, 'LOGOUT', 'administradores', null, null, req);
      }

      res.json({ message: 'Sesión cerrada correctamente' });
    } catch (error) {
      console.error('Error en logout:', error);
      res.status(500).json({ 
        error: 'Error cerrando sesión' 
      });
    }
  }

  // ==================== VERIFICAR ESTADO DE SESIÓN ====================
  
  async verifySession(req, res) {
    try {
      if (req.socio) {
        // Obtener datos completos del socio
        const socioCompleto = await db.query(
          'SELECT * FROM vista_socios_completos WHERE id = $1',
          [req.socioId]
        );

        if (socioCompleto.rows.length === 0) {
          return res.status(404).json({ error: 'Socio no encontrado' });
        }

        res.json({
          type: 'socio',
          user: socioCompleto.rows[0],
          authenticated: true
        });
      } else if (req.admin) {
        res.json({
          type: 'admin',
          user: {
            id: req.admin.id,
            nombre: req.admin.nombre,
            email: req.admin.email,
            rol: req.admin.rol
          },
          authenticated: true
        });
      } else {
        res.status(401).json({ 
          authenticated: false,
          error: 'No autenticado' 
        });
      }
    } catch (error) {
      console.error('Error verificando sesión:', error);
      res.status(500).json({ 
        error: 'Error verificando sesión' 
      });
    }
  }

  // ==================== CAMBIAR CONTRASEÑA ====================
  
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
          error: 'Contraseña actual y nueva son requeridas' 
        });
      }

      const isAdmin = !!req.adminId;
      const userId = req.socioId || req.adminId;
      const table = isAdmin ? 'administradores' : 'socios';

      // Obtener hash actual
      const user = await db.findOne(table, { id: userId }, 'id, password_hash');
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }

      // Verificar contraseña actual
      const validPassword = await comparePassword(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ 
          error: 'Contraseña actual incorrecta' 
        });
      }

      // Hash nueva contraseña
      const newPasswordHash = await hashPassword(newPassword);

      // Actualizar
      await db.update(table, { password_hash: newPasswordHash }, { id: userId });

      // Auditar
      await auditAction(
        isAdmin ? null : userId, 
        isAdmin ? userId : null, 
        'CHANGE_PASSWORD', 
        table, 
        null, 
        null, 
        req
      );

      res.json({ message: 'Contraseña cambiada correctamente' });
    } catch (error) {
      console.error('Error cambiando contraseña:', error);
      res.status(500).json({
        error: 'Error cambiando contraseña'
      });
    }
  }

  // ==================== RECUPERACIÓN DE CONTRASEÑA (SOCIO) ====================
  //
  // GET /api/auth/forgot-password
  //
  // Devuelve SIEMPRE 200 con el mismo mensaje, exista o no el email,
  // para no permitir enumeración de cuentas. El trabajo real (lookup
  // + INSERT token + envío de email) se hace en setImmediate para que
  // el tiempo de respuesta sea constante (sin timing channel).
  async forgotPassword(req, res) {
    const successMessage = {
      message:
        'Si la cuenta existe, te enviaremos un email con instrucciones para restablecer la contraseña.',
    };
    const { email } = req.body || {};
    const emailValid = typeof email === 'string' && email.trim().length > 0;
    const emailTrim = emailValid ? email.trim().toLowerCase() : null;
    const base = resolveBaseUrl();
    const reqMeta = { ip: req.ip, ua: req.get('User-Agent') };

    res.json(successMessage);
    if (!emailValid) return;

    setImmediate(async () => {
      try {
        const socio = await db.findOne('socios', { email: emailTrim, activo: true });
        if (!socio) return;

        const { raw, hash } = generateResetToken();
        await db.query(
          `INSERT INTO password_reset_tokens (socio_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
          [socio.id, hash]
        );
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        const resetUrl = `${base}/restablecer.html?token=${raw}`;

        try {
          await emailService.sendPasswordReset(
            { email: socio.email, nombre: socio.nombre },
            { resetUrl, expiresAt }
          );
        } catch (e) {
          console.warn('[email] sendPasswordReset failed:', e.message);
        }
        try {
          await auditAction(
            socio.id, null, 'REQUEST_PASSWORD_RESET', 'socios',
            null, null, { ip: reqMeta.ip, get: () => reqMeta.ua }
          );
        } catch (e) {
          console.warn('[audit] forgot-password background:', e.message);
        }
      } catch (e) {
        console.warn('[forgot-password] background failed:', e.message);
      }
    });
  }

  // POST /api/auth/reset-password  { token, newPassword }
  async resetPassword(req, res) {
    try {
      const { token, newPassword } = req.body || {};
      if (!token || typeof token !== 'string' || token.length < 32) {
        return res.status(400).json({ error: 'Token inválido' });
      }
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({
          error: 'La nueva contraseña debe tener al menos 8 caracteres',
        });
      }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      // Single-use + TTL chequeado en SQL.
      const result = await db.query(
        `SELECT id, socio_id FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [tokenHash]
      );
      const row = result.rows[0];
      if (!row) return res.status(400).json({ error: 'Token inválido o caducado' });

      const newHash = await hashPassword(newPassword);
      await db.transaction(async (client) => {
        await client.query('UPDATE socios SET password_hash = $1 WHERE id = $2',
          [newHash, row.socio_id]);
        await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
          [row.id]);
      });

      try {
        await auditAction(row.socio_id, null, 'RESET_PASSWORD_SUCCESS',
          'socios', null, null, req);
      } catch (_) { /* nada */ }

      res.json({ message: 'Contraseña restablecida correctamente.' });
    } catch (error) {
      console.error('Error en reset-password:', error);
      res.status(500).json({ error: 'Error restableciendo contraseña' });
    }
  }

  // ==================== RECUPERACIÓN (ADMIN) ====================
  // Misma mecánica que socio pero contra `administradores`.
  async forgotPasswordAdmin(req, res) {
    const successMessage = {
      message:
        'Si la cuenta administrativa existe, te enviaremos un email con instrucciones para restablecer la contraseña.',
    };
    const { email } = req.body || {};
    const emailValid = typeof email === 'string' && email.trim().length > 0;
    const emailTrim = emailValid ? email.trim().toLowerCase() : null;
    const base = resolveBaseUrl();
    const reqMeta = { ip: req.ip, ua: req.get('User-Agent') };

    res.json(successMessage);
    if (!emailValid) return;

    setImmediate(async () => {
      try {
        const admin = await db.findOne('administradores', { email: emailTrim, activo: true });
        if (!admin) return;

        const { raw, hash } = generateResetToken();
        await db.query(
          `INSERT INTO admin_password_reset_tokens (admin_id, token_hash, expires_at)
           VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
          [admin.id, hash]
        );
        const resetUrl = `${base}/restablecer.html?type=admin&token=${raw}`;
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        try {
          await emailService.sendPasswordReset(
            { email: admin.email, nombre: admin.nombre },
            { resetUrl, expiresAt }
          );
        } catch (e) {
          console.warn('[email] sendPasswordReset admin failed:', e.message);
        }
        try {
          await auditAction(
            null, admin.id, 'REQUEST_PASSWORD_RESET', 'administradores',
            null, null, { ip: reqMeta.ip, get: () => reqMeta.ua }
          );
        } catch (e) {
          console.warn('[audit] forgot-password admin background:', e.message);
        }
      } catch (e) {
        console.warn('[forgot-password admin] background failed:', e.message);
      }
    });
  }

  async resetPasswordAdmin(req, res) {
    try {
      const { token, newPassword } = req.body || {};
      if (!token || typeof token !== 'string' || token.length < 32) {
        return res.status(400).json({ error: 'Token inválido' });
      }
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({
          error: 'La nueva contraseña debe tener al menos 8 caracteres',
        });
      }
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const result = await db.query(
        `SELECT id, admin_id FROM admin_password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
        [tokenHash]
      );
      const row = result.rows[0];
      if (!row) return res.status(400).json({ error: 'Token inválido o caducado' });

      const newHash = await hashPassword(newPassword);
      await db.transaction(async (client) => {
        await client.query('UPDATE administradores SET password_hash = $1 WHERE id = $2',
          [newHash, row.admin_id]);
        await client.query('UPDATE admin_password_reset_tokens SET used_at = NOW() WHERE id = $1',
          [row.id]);
      });

      try {
        await auditAction(null, row.admin_id, 'RESET_PASSWORD_SUCCESS',
          'administradores', null, null, req);
      } catch (_) { /* nada */ }

      res.json({ message: 'Contraseña restablecida correctamente.' });
    } catch (error) {
      console.error('Error en reset-password admin:', error);
      res.status(500).json({ error: 'Error restableciendo contraseña' });
    }
  }
}

module.exports = new AuthController();
