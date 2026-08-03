// routes/socios.js
const express = require('express');
const router = express.Router();

const sociosController = require('../controllers/sociosController');
const { authenticateSocio, withAudit } = require('../middleware/auth');
const { validateInput, validateProfileData } = require('../middleware/security');
const { uploadFoto, uploadCV } = require('../services/uploadService');

// Helper para envolver multer y convertir su error en JSON
const wrapMulter = (uploader) => (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Error subiendo fichero' });
    next();
  });
};

// ==================== DIRECTORIO PÚBLICO (solo socios autenticados) ====================
router.get('/directorio',
  authenticateSocio,
  withAudit('VIEW_DIRECTORY', 'socios'),
  sociosController.getDirectorio
);

// Mapa intranet: cada punto lleva id, nombre, apellidos, entidad,
// rol_cluster, provincia y localidad. Sólo visible con sesión socio,
// y filtrado a los que consintieron mapa + visibilidad de datos.
router.get('/mapa',
  authenticateSocio,
  sociosController.getMapaSocios
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

// ==================== SUBIDA DE FOTO Y CV ====================
router.post('/perfil/foto',
  authenticateSocio,
  wrapMulter(uploadFoto),
  sociosController.uploadFoto
);

router.post('/perfil/cv',
  authenticateSocio,
  wrapMulter(uploadCV),
  sociosController.uploadCV
);

router.delete('/perfil/cv',
  authenticateSocio,
  sociosController.deleteCV
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
// Feed de novedades para el dashboard del socio: últimas altas cerca,
// socios que buscan lo que ofrezco y viceversa.
router.get('/feed',
  require('../middleware/auth').authenticateSocio,
  sociosController.getFeed
);

router.get('/mis-datos/exportar',
  authenticateSocio,
  sociosController.exportarDatosPersonales
);

router.delete('/eliminar-cuenta', 
  authenticateSocio,
  validateInput,
  sociosController.eliminarCuenta
);

router.post('/solicitar-baja',
  authenticateSocio,
  validateInput,
  sociosController.solicitarBaja
);

module.exports = router;
