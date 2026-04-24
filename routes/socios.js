// routes/socios.js
const express = require('express');
const router = express.Router();

const sociosController = require('../controllers/sociosController');
const { authenticateSocio, withAudit } = require('../middleware/auth');
const { validateInput, validateProfileData } = require('../middleware/security');

// ==================== DIRECTORIO PÚBLICO (solo socios autenticados) ====================
router.get('/directorio', 
  authenticateSocio,
  withAudit('VIEW_DIRECTORY', 'socios'),
  sociosController.getDirectorio
);

// ==================== PERFIL INDIVIDUAL ====================
router.get('/perfil/:socioId', 
  authenticateSocio,
  sociosController.getPerfil
);

// ==================== PERFIL PROPIO ====================
router.put('/perfil', 
  authenticateSocio,
  validateInput,
  validateProfileData,
  sociosController.updatePerfil
);

// ==================== BÚSQUEDA GEOGRÁFICA ====================
router.get('/cerca', 
  authenticateSocio,
  sociosController.buscarCerca
);

// ==================== OBSERVATORIO/ESTADÍSTICAS ====================
router.get('/observatorio/stats', 
  authenticateSocio,
  sociosController.getObservatorioStats
);

// ==================== RGPD ====================
router.get('/mis-datos/exportar', 
  authenticateSocio,
  sociosController.exportarDatosPersonales
);

router.delete('/eliminar-cuenta', 
  authenticateSocio,
  validateInput,
  sociosController.eliminarCuenta
);

module.exports = router;
