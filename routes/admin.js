// routes/admin.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const landingController = require('../controllers/admin/landing');
const { authenticateAdmin, requireSuperadmin } = require('../middleware/auth');
const { validateInput } = require('../middleware/security');
const { uploadLandingImage } = require('../services/uploadService');
// `wrapMulter` se declara más abajo (era el existente para uploads de
// logo/CSV); reutilizamos esa misma función para las rutas de landing.

const mapTestController = require('../controllers/mapTestController');
router.get('/mapa-prueba', authenticateAdmin, mapTestController.status);
router.get('/mapa-diagnostico', authenticateAdmin, mapTestController.diagnostics);
router.post('/mapa-diagnostico/:socioId/ubicacion', authenticateAdmin, mapTestController.relocate);
router.put('/mapa-prueba', authenticateAdmin, validateInput, mapTestController.update);
router.get('/mapa', authenticateAdmin, require('../controllers/sociosController').getMapaSocios);

// ==================== GESTIÓN SOCIOS PENDIENTES ====================
router.get('/socios/pendientes', 
  authenticateAdmin,
  adminController.getSociosPendientes
);

router.post('/socios/:socioId/aprobar', 
  authenticateAdmin,
  validateInput,
  adminController.aprobarSocio
);

router.post('/socios/:socioId/rechazar', 
  authenticateAdmin,
  validateInput,
  adminController.rechazarSocio
);

// ==================== GESTIÓN SOCIOS ACTIVOS ====================
router.get('/socios', 
  authenticateAdmin,
  adminController.getAllSocios
);

router.post('/socios/:socioId/suspender', 
  authenticateAdmin,
  validateInput,
  adminController.suspenderSocio
);

router.post('/socios/:socioId/reactivar', 
  authenticateAdmin,
  adminController.reactivarSocio
);

// ==================== CONFIGURACIÓN SISTEMA ====================
router.get('/configuracion', 
  authenticateAdmin,
  adminController.getConfiguracion
);

router.put('/configuracion', 
  authenticateAdmin,
  validateInput,
  adminController.updateConfiguracion
);

// ==================== ESTADÍSTICAS ADMIN ====================
router.get('/estadisticas', 
  authenticateAdmin,
  adminController.getEstadisticasAdmin
);

// ==================== AUDITORÍA ====================
router.get('/auditoria', 
  authenticateAdmin,
  adminController.getAuditoria
);

// ==================== MODERACIÓN MENSAJES ====================
router.get('/mensajes/reportados', 
  authenticateAdmin,
  adminController.getMensajesReportados
);

router.post('/mensajes/:mensajeId/moderar', 
  authenticateAdmin,
  validateInput,
  adminController.moderarMensaje
);

// ==================== CREAR ADMINISTRADOR ====================
router.post('/admins', 
  authenticateAdmin,
  validateInput,
  adminController.crearAdmin
);

// ==================== v2: IDENTIDAD ORGANIZACIÓN ====================
const { uploadLogo, uploadCSV } = require('../services/uploadService');
const wrapMulter = (uploader) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Error subiendo fichero' });
    next();
  });
};

router.get('/organizacion',
  authenticateAdmin,
  adminController.getOrganizacion
);

router.put('/organizacion',
  authenticateAdmin,
  validateInput,
  adminController.updateOrganizacion
);

router.post('/organizacion/logo',
  authenticateAdmin,
  wrapMulter(uploadLogo),
  adminController.uploadOrganizacionLogo
);

// ==================== v2: BAJAS PENDIENTES ====================
router.get('/bajas',
  authenticateAdmin,
  adminController.getBajasPendientes
);

router.post('/bajas/:bajaId/gestionar',
  authenticateAdmin,
  validateInput,
  adminController.gestionarBaja
);

// ==================== v2: IMPORTACIÓN MASIVA CSV ====================
router.get('/socios/plantilla-csv',
  authenticateAdmin,
  adminController.descargarPlantillaCSV
);

router.post('/socios/importar',
  authenticateAdmin,
  wrapMulter(uploadCSV),
  adminController.importarCSV
);

router.get('/socios/invitados',
  authenticateAdmin,
  adminController.getAccesosInvitados
);

router.post('/socios/invitados/:invitadoId/aprobar',
  authenticateAdmin,
  adminController.aprobarAccesoInvitado
);

// Editar una fila del CSV (para corregir errores antes de aprobar).
// Revalida y actualiza el estado a 'pendiente' si ya no hay errores.
router.put('/socios/invitados/:invitadoId',
  authenticateAdmin,
  validateInput,
  adminController.updateAccesoInvitado
);

// ==================== v2: ACCESOS GENERADOS ====================
router.get('/socios/accesos',
  authenticateAdmin,
  adminController.getAccesosGenerados
);

// ==================== v2: EXPORTACIÓN CSV DE CONTACTOS ====================
router.get('/socios/exportar',
  authenticateAdmin,
  adminController.exportarSociosCSV
);

// ==================== CMS DE LANDING PÚBLICA ====================
// Antes el frontend admin-landing.js llamaba a estos endpoints y la
// pestaña mostraba "Error cargando contenido: Endpoint no encontrado"
// porque NO estaban montados (hallazgo ALTA nº 2 de la auditoría del
// 10 jun). El controller ya existía en controllers/admin/landing.js.

// GET /api/admin/landing  → listar todas las claves de landing_content
router.get('/landing',
  authenticateAdmin,
  landingController.listContent
);

// PUT /api/admin/landing/:clave  → actualizar valor de texto
router.put('/landing/:clave',
  authenticateAdmin,
  validateInput,
  landingController.updateContent
);

// POST /api/admin/landing/:clave/imagen  → subir imagen y actualizar URL
router.post('/landing/:clave/imagen',
  authenticateAdmin,
  wrapMulter(uploadLandingImage),
  landingController.uploadImage
);

// ==================== CONFIGURACIÓN DE CORREO SALIENTE (SMTP) ====================
// Reservada a superadmin: contiene credenciales del proveedor de correo.
router.get('/config/smtp/deliveries', authenticateAdmin, adminController.getEmailDeliveries);

router.get('/config/smtp',
  authenticateAdmin, requireSuperadmin,
  adminController.getSmtpConfig
);
router.post('/config/smtp',
  authenticateAdmin, requireSuperadmin,
  validateInput,
  adminController.saveSmtpConfig
);
router.post('/config/smtp/test',
  authenticateAdmin, requireSuperadmin,
  validateInput,
  adminController.testSmtpConfig
);

// ==================== USUARIOS Y ROLES (SUPERADMIN) ====================
// Gestión de administradores desde la UI: alta, cambio de rol, activar/
// desactivar y reseteo de contraseña. Sólo accesible para superadmin.
router.get('/administradores',
  authenticateAdmin, requireSuperadmin,
  adminController.listAdmins
);
router.post('/administradores',
  authenticateAdmin, requireSuperadmin,
  validateInput,
  adminController.createAdmin
);
router.put('/administradores/:id',
  authenticateAdmin, requireSuperadmin,
  validateInput,
  adminController.updateAdmin
);
router.post('/administradores/:id/reset-password',
  authenticateAdmin, requireSuperadmin,
  adminController.resetAdminPassword
);
router.delete('/administradores/:id',
  authenticateAdmin, requireSuperadmin,
  adminController.deactivateAdmin
);

// Gestión avanzada de socios: cambiar tipo_socio o restablecer contraseña
// (envía email al socio con enlace de reseteo).
router.put('/socios/:socioId/tipo',
  authenticateAdmin, requireSuperadmin,
  validateInput,
  adminController.changeSocioType
);
router.post('/socios/:socioId/reset-password',
  authenticateAdmin, requireSuperadmin,
  adminController.resetSocioPassword
);

// Reenviar email de bienvenida a un socio ya aprobado. Útil cuando el
// original quedó en spam, el socio cambió de email o no lo recibió.
router.post('/socios/:socioId/reenviar-bienvenida',
  authenticateAdmin,
  adminController.reenviarBienvenida
);

// Evolución mensual: altas de socios agregadas por mes (últimos 12 meses).
// Sirve para el gráfico del dashboard admin y para reportes a la Junta.
router.get('/stats/altas-mensuales',
  authenticateAdmin,
  adminController.getAltasMensuales
);

// La ruta GET /api/admin/auditoria ya está definida más arriba
// (usa adminController.getAuditoria). Aquí sólo añadimos la exportación
// CSV con los mismos filtros para no duplicar rutas.
router.get('/auditoria/exportar',
  authenticateAdmin,
  adminController.exportarAuditoriaCSV
);

// ==================== COMUNICACIONES MASIVAS ====================
// Preview de destinatarios que cumplen los filtros, sin enviar nada.
router.post('/comunicaciones/preview',
  authenticateAdmin,
  validateInput,
  adminController.previewComunicacion
);
// Envío real. Requiere superadmin porque puede afectar a cientos de socios.
router.post('/comunicaciones/enviar',
  authenticateAdmin, requireSuperadmin,
  validateInput,
  adminController.enviarComunicacion
);

module.exports = router;
