// services/emailService.js
const nodemailer = require('nodemailer');
const config = require('../config/config');
const db = require('../config/database');
const { contactEmailFor } = require('./contactEmail');
const legalNotice = require('./associationLegalNotice');

// Lee un prefijo de claves de landing_content (las plantillas de email
// editables viven ahí). Si la BD no responde o no hay claves, devuelve {}
// y el caller usa sus defaults.
async function loadEditableContent(prefix) {
  try {
    const result = await db.query(
      'SELECT clave, valor FROM landing_content WHERE clave LIKE $1',
      [prefix + '%']
    );
    const out = {};
    for (const row of result.rows) out[row.clave] = row.valor;
    return out;
  } catch (e) {
    console.warn('[email] loadEditableContent failed:', e.message);
    return {};
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[c]));
}

const PLACEHOLDER_VALUES = new Set([
  'noreply@agesport.org',
  'your_email_password',
  'tu_password_email'
]);

function mailFailure(error) {
  if (error.code === 'EAUTH' || error.responseCode === 535) return {success:false, reason:'smtp_authentication', error:'El servidor de correo rechaza las credenciales. Para Gmail, utiliza una contraseña de aplicación válida y comprueba la cuenta remitente.'};
  if (['ESOCKET','ECONNECTION','ECONNREFUSED','ETIMEDOUT'].includes(error.code)) return {success:false, reason:'smtp_unreachable', error:'No se pudo conectar con el servidor de correo. Revisa el host, puerto y conexión.'};
  return {success:false, reason:'smtp_rejected', error:'El proveedor rechazó el envío. Revisa la configuración de correo y el destinatario.'};
}

// Errores transitorios que merece la pena reintentar: códigos SMTP 4xx
// (greylisting, "too many connections", límites por minuto del proveedor)
// y cortes de red. Las credenciales erróneas o destinatarios inexistentes
// (5xx) no se reintentan.
function isTransient(error) {
  if (error.responseCode >= 400 && error.responseCode < 500) return true;
  return ['ESOCKET','ECONNECTION','ETIMEDOUT','ECONNRESET','EDNS'].includes(error.code);
}

const RETRIES = Math.max(0, parseInt(process.env.EMAIL_MAX_RETRIES || '2', 10));
const RETRY_DELAY_MS = parseInt(process.env.EMAIL_RETRY_DELAY_MS || (process.env.NODE_ENV === 'test' ? '0' : '2000'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Transporte preparado para producción: conexiones reutilizadas (pool) y
// ritmo limitado para no superar los límites del proveedor en envíos a
// muchos socios. `secure` se deduce del puerto si no se indica (465 = TLS).
function buildTransport(cfg) {
  const port = Number(cfg.port) || 587;
  return nodemailer.createTransport({
    pool: true,
    maxConnections: Math.max(1, parseInt(process.env.EMAIL_MAX_CONNECTIONS || '3', 10)),
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: Math.max(1, parseInt(process.env.EMAIL_RATE_PER_SECOND || '5', 10)),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    host: cfg.host,
    port,
    secure: cfg.secure === undefined || cfg.secure === null ? port === 465 : !!cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

// Plantilla HTML común. Todos los textos llegan ya escapados.
function layout({ heading, paragraphs = [], quote = null, list = null, cta = null, footer = '' }) {
  const p = (t) => '<p style="margin:0 0 14px">' + t + '</p>';
  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>' +
    '<body style="margin:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#1f2d27">' +
    '<div style="max-width:600px;margin:0 auto;background:#ffffff">' +
    '<div style="background:#0d355f;color:#ffffff;padding:22px 28px;font-weight:700;letter-spacing:.04em">MAPA DEL TALENTO · AGESPORT</div>' +
    '<div style="padding:28px;line-height:1.55;font-size:15px">' +
    (heading ? '<h2 style="margin:0 0 18px;color:#0d355f;font-size:21px">' + heading + '</h2>' : '') +
    paragraphs.filter(Boolean).map(p).join('') +
    (quote ? '<div style="background:#f3f6f4;border-left:4px solid #37964f;padding:14px 16px;margin:0 0 16px">' + quote + '</div>' : '') +
    (list && list.items.length ? (list.intro ? p(list.intro) : '') + '<ul style="margin:0 0 16px;padding-left:20px">' + list.items.map((i) => '<li>' + i + '</li>').join('') + '</ul>' : '') +
    (cta ? '<p style="margin:26px 0"><a href="' + cta.url + '" style="display:inline-block;padding:12px 22px;background:#0d355f;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">' + cta.label + '</a></p>' : '') +
    '</div>' +
    '<div style="background:#f3f6f4;padding:16px 28px;font-size:12px;color:#5b6b63">' + (footer || 'AGESPORT · Asociación Andaluza de Gestores del Deporte') + '</div>' +
    '</div></body></html>';
}

class EmailService {
  constructor() {
    // Configurar transporter solo si hay configuración de email
    this.transporter = null;
    this.fromLabel = process.env.EMAIL_FROM || null; // string listo para `from:`
    this.replyTo = process.env.EMAIL_REPLY_TO || null;
    if (
      config.email.auth.user &&
      config.email.auth.pass &&
      !PLACEHOLDER_VALUES.has(config.email.auth.user) &&
      !PLACEHOLDER_VALUES.has(config.email.auth.pass)
    ) {
      this.transporter = buildTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        user: config.email.auth.user,
        pass: config.email.auth.pass,
      });
    }
    // Cargar override de BD si existe (permite que el admin cambie la
    // config sin tocar .env). Async, sin bloquear el arranque.
    this.ready = this.loadDbOverrideAsync();
  }

  async loadDbOverrideAsync() {
    try {
      const row = await db.query("SELECT valor FROM configuracion WHERE clave = 'smtp_config'");
      if (row.rows.length) {
        const cfg = JSON.parse(row.rows[0].valor);
        // La contraseña viene cifrada; descífrala en memoria.
        const { decryptData } = require('../middleware/auth');
        let pass = null;
        if (cfg.passEncrypted) {
          try { pass = decryptData(cfg.passEncrypted); } catch (_) { /* no romper el arranque */ }
        }
        this.reloadFromConfig({ ...cfg, pass });
      }
    } catch (e) {
      // Sin config en BD → seguimos con la de .env (o sin SMTP).
    }
  }

  // Recarga en caliente el transporter con una nueva config (viene del
  // panel admin tras "Guardar configuración"). No requiere reiniciar.
  reloadFromConfig(cfg) {
    if (!cfg || !cfg.host || !cfg.user) return;
    const previous = this.transporter;
    this.transporter = buildTransport(cfg);
    if (previous && typeof previous.close === 'function') {
      try { previous.close(); } catch (_) { /* pool ya cerrado */ }
    }
    const fromEmail = cfg.fromEmail || cfg.user;
    const fromName = cfg.fromName || 'AGESPORT · Mapa del Talento';
    this.fromLabel = `"${fromName}" <${fromEmail}>`;
    this.replyTo = cfg.replyTo || null;
    console.log('[email] Config SMTP recargada:', cfg.host + ':' + (cfg.port || 587));
  }

  // Envío de prueba: usa la config recibida sin persistirla. Devuelve
  // {success, error?} para que el admin vea el resultado en el panel.
  async sendTestEmail(cfg, to) {
    try {
      if (!cfg.pass) {
        return { success: false, error: 'Falta la contraseña. Introdúcela o guarda primero la configuración.' };
      }
      const t = nodemailer.createTransport({
        connectionTimeout:10000, greetingTimeout:10000, socketTimeout:15000,
        host: cfg.host, port: cfg.port || 587,
        secure: cfg.secure === undefined || cfg.secure === null ? Number(cfg.port) === 465 : !!cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
      });
      const testBody = '<p>Este correo confirma que la configuración SMTP funciona correctamente.</p>' +
        '<p>Host: <code>' + escapeHtml(cfg.host) + ':' + (cfg.port || 587) + '</code></p>' +
        '<p>Enviado desde el panel de administración.</p>';
      const result = await t.sendMail({
        from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
        to,
        replyTo: cfg.replyTo || undefined,
        subject: 'AGESPORT · Prueba de configuración de correo',
        ...legalNotice.append(testBody, this.htmlToText(testBody)),
      });
      const delivery = result.rejected?.length && !result.accepted?.length
        ? {success:false,reason:'recipient_rejected',error:'El proveedor rechazó al destinatario.'}
        : {success:true};
      await this.recordDelivery(to, delivery);
      return delivery;
    } catch (e) {
      const failure = mailFailure(e);
      await this.recordDelivery(to, failure);
      return failure;
    }
  }

  async recordDelivery(to, result) {
    try {
      await db.query('INSERT INTO email_delivery_log(recipient,status,error_code) VALUES($1,$2,$3)',
        [String(to), result.success ? 'accepted' : 'failed', result.success ? null : (result.reason || 'smtp_error')]);
      await db.query("DELETE FROM email_delivery_log WHERE created_at < NOW() - INTERVAL '90 days'");
    } catch (e) { console.warn('[email] No se pudo guardar el resultado del envío:', e.code || 'log_error'); }
  }

  async sendEmail(to, subject, html, text = null) {
    await this.ready;
    const content = legalNotice.append(html, text || this.htmlToText(html));
    let delivery;
    if (!to) {
      delivery = {success:false, reason:'recipient_missing', error:'El socio no tiene un email de contacto válido.'};
    } else if (!this.transporter) {
      delivery = {success:false, reason:'email_not_configured', error:'No hay un servidor de correo configurado.'};
    } else {
      for (let attempt = 0; ; attempt++) {
        try {
          const result = await this.transporter.sendMail({
            from:this.fromLabel || `"AGESPORT Mapa del Talento" <${config.email.auth.user}>`,
            to, subject, ...content,
            ...(this.replyTo ? {replyTo:this.replyTo} : {})
          });
          delivery = result.rejected?.length && !result.accepted?.length
            ? {success:false,reason:'recipient_rejected',error:'El proveedor rechazó al destinatario.'}
            : {success:true,messageId:result.messageId};
          break;
        } catch (e) {
          if (attempt < RETRIES && isTransient(e)) {
            await sleep(RETRY_DELAY_MS * (attempt + 1));
            continue;
          }
          delivery = mailFailure(e);
          break;
        }
      }
    }
    await this.recordDelivery(to || '(sin email)', delivery);
    return delivery;
  }

  // Textos editables (Administración > Plantillas de email) con fallback.
  async template(prefix, defaults, vars = {}) {
    const stored = await loadEditableContent(prefix);
    const out = {};
    for (const [key, fallback] of Object.entries(defaults)) {
      const raw = stored[prefix + key];
      const value = raw === undefined || raw === null || String(raw).trim() === '' ? fallback : String(raw);
      out[key] = value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name] ?? '') : m));
    }
    return out;
  }

  // Convertir HTML básico a texto plano
  htmlToText(html) {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .trim();
  }

  // ==================== EMAILS ESPECÍFICOS ====================

  async notifyAdminNewRegistration(socio) {
    const nombre = escapeHtml(`${socio.nombre} ${socio.apellidos}`);
    const subject = `[AGESPORT] Nuevo registro pendiente: ${socio.nombre} ${socio.apellidos}`;
    const html = layout({
      heading: 'Nuevo registro pendiente de aprobación',
      paragraphs: [
        '<strong>Socio:</strong> ' + nombre,
        '<strong>Email:</strong> ' + escapeHtml(socio.email),
        '<strong>Fecha de registro:</strong> ' + new Date().toLocaleDateString('es-ES'),
        'Un nuevo socio se ha registrado en el Mapa del Talento y está esperando aprobación.',
      ],
      cta: { url: `${config.app.publicBaseUrl}/acceso-admin.html`, label: 'Revisar en el panel de administración' },
      footer: 'Este email se envía automáticamente.',
    });

    // Enviar a todos los administradores activos
    const admins = await this.getActiveAdmins();
    const results = [];
    for (const admin of admins) {
      const result = await this.sendEmail(admin.email, subject, html);
      results.push({ admin: admin.email, ...result });
    }
    return results;
  }

  // Acuse de recibo al solicitante (plantilla email.confirmation.*).
  async notifyRegistrationReceived(socio) {
    const t = await this.template('email.confirmation.', {
      subject: 'Hemos recibido tu solicitud · Mapa del Talento AGESPORT',
      heading: 'Solicitud recibida',
      greeting: 'Hola {nombre},',
      body: 'Gracias por solicitar tu alta en el Mapa del Talento de AGESPORT. La Gerencia revisará tus datos y te avisaremos por email en cuanto tu cuenta esté aprobada.',
      outro: 'Si no has sido tú quien ha hecho esta solicitud, contacta con AGESPORT.',
      signature: 'Equipo AGESPORT',
    }, { nombre: socio.nombre });
    const html = layout({
      heading: escapeHtml(t.heading),
      paragraphs: [escapeHtml(t.greeting), escapeHtml(t.body), escapeHtml(t.outro), escapeHtml(t.signature)],
    });
    return this.sendEmail(contactEmailFor(socio), t.subject, html);
  }

  async notifySocioApproved(socio) {
    const t = await this.template('email.welcome.', {
      subject: '¡Bienvenido al Mapa del Talento de AGESPORT!',
      heading: '¡Tu cuenta ha sido aprobada!',
      greeting: 'Hola {nombre},',
      intro: '¡Excelentes noticias! Tu registro en el Mapa del Talento de AGESPORT ha sido aprobado por nuestra Gerencia.',
      list_intro: 'Ya puedes acceder a la plataforma y:',
      list_items: 'Explorar el directorio de socios|Contactar con otros profesionales del sector|Participar en el ecosistema B2B del clúster|Actualizar tu perfil cuando necesites',
      cta: 'Acceder a la Plataforma',
      outro: 'Si tienes cualquier duda, no dudes en contactar con nosotros.',
      signature: '¡Bienvenido/a a la comunidad!',
    }, { nombre: socio.nombre });
    const html = layout({
      heading: escapeHtml(t.heading),
      paragraphs: [escapeHtml(t.greeting), escapeHtml(t.intro), 'Entra con el email de acceso <strong>' + escapeHtml(socio.email) + '</strong> y la contraseña que elegiste al registrarte.'],
      list: { intro: escapeHtml(t.list_intro), items: t.list_items.split(/[|\n]/).map((x) => x.trim()).filter(Boolean).map(escapeHtml) },
      cta: { url: `${config.app.publicBaseUrl}/acceso.html`, label: escapeHtml(t.cta) },
      footer: escapeHtml(t.outro) + '<br>' + escapeHtml(t.signature),
    });
    return this.sendEmail(contactEmailFor(socio), t.subject, html);
  }

  async notifySocioRejected(socio, motivo = null) {
    const t = await this.template('email.rejection.', {
      subject: 'Información sobre tu solicitud en el Mapa del Talento AGESPORT',
      heading: 'Información sobre tu solicitud',
      greeting: 'Hola {nombre},',
      intro: 'Tras revisar tu solicitud de alta en el Mapa del Talento de AGESPORT, no hemos podido aprobarla en este momento.',
      motivo_label: 'Motivo:',
      outro: 'Si crees que se trata de un error o quieres más información, puedes contactar con la Gerencia de AGESPORT.',
      signature: 'Gracias por tu interés en AGESPORT.',
    }, { nombre: socio.nombre });
    const html = layout({
      heading: escapeHtml(t.heading),
      paragraphs: [
        escapeHtml(t.greeting), escapeHtml(t.intro),
        motivo ? '<strong>' + escapeHtml(t.motivo_label) + '</strong> ' + escapeHtml(motivo) : '',
        escapeHtml(t.outro), escapeHtml(t.signature),
      ],
    });
    return this.sendEmail(contactEmailFor(socio), t.subject, html);
  }

  // `receptor` debe incluir los campos de email del socio; el aviso se
  // envía siempre al email de contacto elegido, nunca al de acceso si el
  // socio ha escogido otro.
  async notifyNewMessage(receptor, emisor, preview) {
    if (!receptor.acepta_notificaciones_email) {
      return { success: false, reason: 'notifications_disabled' };
    }
    const emisorNombre = `${emisor.nombre || ''} ${emisor.apellidos || ''}`.trim();
    const t = await this.template('email.message.', {
      subject: 'Nuevo mensaje de {emisor} · AGESPORT',
      intro: '{emisor} te ha enviado un mensaje en el Mapa del Talento:',
      cta: 'Ver el mensaje completo',
      outro: 'Recibes este aviso porque lo tienes activado en tu perfil. Puedes desactivarlo o cambiar el email de avisos desde Mi perfil.',
    }, { emisor: emisorNombre, nombre: receptor.nombre });
    const extract = String(preview || '');
    const html = layout({
      heading: 'Tienes un nuevo mensaje',
      paragraphs: ['Hola <strong>' + escapeHtml(receptor.nombre || '') + '</strong>,', escapeHtml(t.intro)],
      quote: escapeHtml(extract.length > 160 ? extract.substring(0, 160) + '…' : extract),
      cta: { url: `${config.app.publicBaseUrl}/mensajes.html`, label: escapeHtml(t.cta) },
      footer: escapeHtml(t.outro),
    });
    return this.sendEmail(contactEmailFor(receptor), t.subject, html);
  }

  // ==================== HELPERS ====================

  async getActiveAdmins() {
    const db = require('../config/database');
    return await db.findMany('administradores', { activo: true }, { 
      select: 'id, email, nombre' 
    });
  }

  // Enviar email de prueba para verificar configuración
  // Email para socios creados desde importación masiva (con contraseña temporal)
  async sendAccountApproved(socio, options = {}) {
    const { passwordTemporal, adminNombre } = options;
    const baseUrl = config.app.publicBaseUrl;
    const subject = 'Tu acceso al Mapa del Talento AGESPORT';
    const html = `
      <div style="font-family: Arial, sans-serif; color: #18222e">
        <h2 style="color:#0d355f">Bienvenida/o al Mapa del Talento AGESPORT</h2>
        <p>Hola ${socio.nombre},</p>
        <p>${adminNombre || 'La Gerencia de AGESPORT'} ha creado tu acceso al entorno privado del Mapa del Talento.</p>
        <p>Estos son tus datos de acceso provisionales:</p>
        <ul>
          <li><strong>Email:</strong> ${socio.email}</li>
          <li><strong>Contraseña temporal:</strong> ${passwordTemporal}</li>
        </ul>
        <p>Por seguridad, te recomendamos cambiar la contraseña la primera vez que entres.</p>
        <p><a href="${baseUrl}/acceso.html" style="display:inline-block;padding:10px 18px;background:#0d355f;color:#fff;border-radius:8px;text-decoration:none">Acceder a la plataforma</a></p>
        <p>Un saludo,<br>Equipo AGESPORT</p>
      </div>`;
    const text = `Hola ${socio.nombre},

${adminNombre || 'La Gerencia de AGESPORT'} ha creado tu acceso al Mapa del Talento.
Email: ${socio.email}
Contraseña temporal: ${passwordTemporal}

Por favor, cámbiala la primera vez que entres: ${baseUrl}/acceso.html

Equipo AGESPORT`;

    return this.sendEmail(socio.email, subject, html, text);
  }

  // Email de recuperación de contraseña (sirve para socio y admin).
  // `recipient` = { email, nombre }
  // `opts` = { resetUrl, expiresAt }  → expiresAt es un Date.
  async sendPasswordReset(recipient, opts) {
    const nombreSafe = escapeHtml(recipient.nombre || '');
    const url = opts.resetUrl;
    const hours = Math.max(
      1,
      Math.round((opts.expiresAt.getTime() - Date.now()) / 3600000)
    );
    const subject = 'Restablece tu contraseña — AGESPORT';
    const html = `
<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="referrer" content="no-referrer"></head>
<body style="font-family: Arial, sans-serif; color: #18222e; max-width: 580px; margin: 0 auto;">
  <h2 style="color:#0d355f">Restablecer contraseña</h2>
  <p>Hola ${nombreSafe},</p>
  <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en
     el <strong>Mapa del Talento AGESPORT</strong>.</p>
  <p>Pulsa el siguiente botón para crear una contraseña nueva:</p>
  <p>
    <a href="${url}" style="display:inline-block;padding:12px 22px;
       background:#0d355f;color:#fff;border-radius:8px;
       text-decoration:none;font-weight:600">Restablecer contraseña</a>
  </p>
  <p style="font-size:.9em;color:#6b6b6b">
     Este enlace caduca en aproximadamente ${hours} hora${hours === 1 ? '' : 's'}
     y sólo puede usarse una vez.</p>
  <p style="font-size:.9em;color:#6b6b6b">
     Si no fuiste tú quien lo pidió, puedes ignorar este mensaje:
     tu contraseña actual sigue siendo válida.</p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">
  <p style="font-size:.8em;color:#6b6b6b">
     Equipo AGESPORT — Mapa del Talento
  </p>
</body></html>`;
    const text = `Hola ${recipient.nombre || ''},

Hemos recibido una solicitud para restablecer tu contraseña.
Pega este enlace en el navegador (caduca en ~${hours}h y es de un solo uso):
${url}

Si no fuiste tú, ignora este email — tu contraseña actual sigue siendo válida.

Equipo AGESPORT`;

    return this.sendEmail(recipient.email, subject, html, text);
  }

  async testEmail(toEmail = null) {
    const testEmail = toEmail || 'test@agesport.org';
    const subject = 'Test - Configuración de Email AGESPORT';

    const html = `
      <h2>Test de configuración de email</h2>
      <p>Si recibes este email, la configuración es correcta.</p>
      <p>Timestamp: ${new Date().toISOString()}</p>
    `;

    return await this.sendEmail(testEmail, subject, html);
  }
}

module.exports = new EmailService();
