// routes/admin.js
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { authenticateAdmin } = require('../middleware/auth');
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

module.exports = router;
