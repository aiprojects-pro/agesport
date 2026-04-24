// routes/mensajeria.js
const express = require('express');
const router = express.Router();

const mensajeriaController = require('../controllers/mensajeriaController');
const { authenticateSocio } = require('../middleware/auth');
const { validateInput, messagingLimiter } = require('../middleware/security');

// ==================== CONVERSACIONES ====================
router.get('/conversaciones', 
  authenticateSocio,
  mensajeriaController.getConversaciones
);

router.post('/conversaciones', 
  authenticateSocio,
  validateInput,
  mensajeriaController.iniciarConversacion
);

// ==================== MENSAJES ====================
router.get('/conversaciones/:conversacionId/mensajes', 
  authenticateSocio,
  mensajeriaController.getMensajes
);

router.post('/mensajes', 
  authenticateSocio,
  messagingLimiter,
  validateInput,
  mensajeriaController.enviarMensaje
);

router.post('/mensajes/:mensajeId/reportar', 
  authenticateSocio,
  validateInput,
  mensajeriaController.reportarMensaje
);

// ==================== MARCAR COMO LEÍDO ====================
router.post('/conversaciones/:conversacionId/leer', 
  authenticateSocio,
  mensajeriaController.marcarComoLeida
);

// ==================== ESTADÍSTICAS ====================
router.get('/estadisticas', 
  authenticateSocio,
  mensajeriaController.getEstadisticasMensajeria
);

module.exports = router;
