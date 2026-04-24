// services/emailService.js
const nodemailer = require('nodemailer');
const config = require('../config/config');

const PLACEHOLDER_VALUES = new Set([
  'noreply@agesport.org',
  'your_email_password',
  'tu_password_email'
]);

class EmailService {
  constructor() {
    // Configurar transporter solo si hay configuración de email
    this.transporter = null;
    if (
      config.email.auth.user &&
      config.email.auth.pass &&
      !PLACEHOLDER_VALUES.has(config.email.auth.user) &&
      !PLACEHOLDER_VALUES.has(config.email.auth.pass)
    ) {
      this.transporter = nodemailer.createTransport({
        host: config.email.host,
        port: config.email.port,
        secure: config.email.secure,
        auth: config.email.auth
      });
    }
  }

  async sendEmail(to, subject, html, text = null) {
    if (!this.transporter) {
      console.log('📧 Email no configurado, simulando envío:', { to, subject });
      return { success: false, reason: 'email_not_configured' };
    }

    try {
      const mailOptions = {
        from: `"AGESPORT Mapa del Talento" <${config.email.auth.user}>`,
        to,
        subject,
        html,
        text: text || this.htmlToText(html)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('📧 Email enviado:', to, subject);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return { success: false, error: error.message };
    }
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
    const subject = `[AGESPORT] Nuevo registro pendiente: ${socio.nombre} ${socio.apellidos}`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #4F4F4F; }
          .header { background: #002D54; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .button { background: #A4C639; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
          .footer { background: #F5F7F9; padding: 15px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MAPA DEL TALENTO · AGESPORT</h1>
        </div>
        <div class="content">
          <h2>Nuevo registro pendiente de aprobación</h2>
          <p><strong>Socio:</strong> ${socio.nombre} ${socio.apellidos}</p>
          <p><strong>Email:</strong> ${socio.email}</p>
          <p><strong>Fecha registro:</strong> ${new Date().toLocaleDateString('es-ES')}</p>
          
          <p>Un nuevo socio se ha registrado en el Mapa del Talento y está esperando aprobación.</p>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config.app.publicBaseUrl}/admin/socios/pendientes" class="button">
              Revisar en Panel Admin
            </a>
          </p>
        </div>
        <div class="footer">
          <p>AGESPORT - Asociación Andaluza de Gestores del Deporte<br>
          Este email se envía automáticamente. No responder.</p>
        </div>
      </body>
      </html>
    `;

    // Enviar a todos los administradores activos
    const admins = await this.getActiveAdmins();
    const results = [];
    
    for (const admin of admins) {
      const result = await this.sendEmail(admin.email, subject, html);
      results.push({ admin: admin.email, ...result });
    }
    
    return results;
  }

  async notifySocioApproved(socio) {
    const subject = '¡Bienvenido al Mapa del Talento de AGESPORT!';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #4F4F4F; }
          .header { background: #002D54; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .button { background: #A4C639; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; }
          .footer { background: #F5F7F9; padding: 15px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MAPA DEL TALENTO · AGESPORT</h1>
        </div>
        <div class="content">
          <h2>¡Tu cuenta ha sido aprobada!</h2>
          <p>Hola <strong>${socio.nombre}</strong>,</p>
          
          <p>¡Excelentes noticias! Tu registro en el Mapa del Talento de AGESPORT ha sido aprobado por nuestra Gerencia.</p>
          
          <p>Ya puedes acceder a la plataforma y:</p>
          <ul>
            <li>Explorar el directorio de socios</li>
            <li>Contactar con otros profesionales del sector</li>
            <li>Participar en el ecosistema B2B del clúster</li>
            <li>Actualizar tu perfil cuando necesites</li>
          </ul>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config.app.publicBaseUrl}/login" class="button">
              Acceder a la Plataforma
            </a>
          </p>
          
          <p>Si tienes cualquier duda, no dudes en contactar con nosotros.</p>
          
          <p>¡Bienvenido/a a la comunidad!</p>
        </div>
        <div class="footer">
          <p>AGESPORT - Asociación Andaluza de Gestores del Deporte<br>
          <a href="https://www.agesport.org">www.agesport.org</a></p>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(socio.email, subject, html);
  }

  async notifySocioRejected(socio, motivo = null) {
    const subject = 'Información sobre tu registro en AGESPORT';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #4F4F4F; }
          .header { background: #002D54; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .footer { background: #F5F7F9; padding: 15px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MAPA DEL TALENTO · AGESPORT</h1>
        </div>
        <div class="content">
          <h2>Información sobre tu registro</h2>
          <p>Hola <strong>${socio.nombre}</strong>,</p>
          
          <p>Te escribimos en relación a tu solicitud de registro en el Mapa del Talento de AGESPORT.</p>
          
          <p>Tras revisar tu solicitud, no hemos podido proceder con la aprobación en este momento.</p>
          
          ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
          
          <p>Si crees que ha habido algún error o deseas obtener más información, puedes contactar directamente con nuestra Gerencia.</p>
          
          <p>Gracias por tu interés en AGESPORT.</p>
        </div>
        <div class="footer">
          <p>AGESPORT - Asociación Andaluza de Gestores del Deporte<br>
          <a href="https://www.agesport.org">www.agesport.org</a></p>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(socio.email, subject, html);
  }

  async notifyNewMessage(receptor, emisor, preview) {
    if (!receptor.acepta_notificaciones_email) {
      return { success: false, reason: 'notifications_disabled' };
    }

    const subject = `Nuevo mensaje de ${emisor.nombre} - AGESPORT`;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #4F4F4F; }
          .header { background: #002D54; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; }
          .message { background: #F5F7F9; padding: 15px; border-left: 4px solid #A4C639; margin: 15px 0; }
          .button { background: #A4C639; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
          .footer { background: #F5F7F9; padding: 15px; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>MAPA DEL TALENTO · AGESPORT</h1>
        </div>
        <div class="content">
          <h2>Tienes un nuevo mensaje</h2>
          <p>Hola <strong>${receptor.nombre}</strong>,</p>
          
          <p><strong>${emisor.nombre} ${emisor.apellidos}</strong> te ha enviado un mensaje:</p>
          
          <div class="message">
            ${preview.length > 100 ? preview.substring(0, 100) + '...' : preview}
          </div>
          
          <p style="text-align: center; margin: 30px 0;">
            <a href="${config.app.publicBaseUrl}/mensajes" class="button">
              Ver Mensaje Completo
            </a>
          </p>
          
          <p style="font-size: 12px; color: #999;">
            Para desactivar estas notificaciones, accede a tu perfil y actualiza tus preferencias.
          </p>
        </div>
        <div class="footer">
          <p>AGESPORT - Asociación Andaluza de Gestores del Deporte<br>
          Este email se envía automáticamente. No responder directamente.</p>
        </div>
      </body>
      </html>
    `;

    return await this.sendEmail(receptor.email, subject, html);
  }

  // ==================== HELPERS ====================

  async getActiveAdmins() {
    const db = require('../config/database');
    return await db.findMany('administradores', { activo: true }, { 
      select: 'id, email, nombre' 
    });
  }

  // Enviar email de prueba para verificar configuración
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

// Instalar nodemailer si no está
const installNodemailer = async () => {
  try {
    require('nodemailer');
  } catch (error) {
    console.log('📧 Instalando nodemailer...');
    const { exec } = require('child_process');
    return new Promise((resolve, reject) => {
      exec('npm install nodemailer', (error, stdout, stderr) => {
        if (error) {
          console.error('Error instalando nodemailer:', error);
          reject(error);
        } else {
          console.log('✅ Nodemailer instalado');
          resolve();
        }
      });
    });
  }
};

module.exports = new EmailService();
