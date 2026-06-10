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

module.exports = router;
