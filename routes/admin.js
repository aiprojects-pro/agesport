// routes/admin.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { authenticateAdmin, requireSuperadmin } = require('../middleware/auth');
const { validateInput } = require('../middleware/security');

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

module.exports = router;
