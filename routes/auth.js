// routes/auth.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { 
  authLimiter, 
  registerLimiter, 
  validateRegistrationData, 
  validateInput 
} = require('../middleware/security');
const { authenticateAny } = require('../middleware/auth');

// ==================== REGISTRO ====================
router.post('/register', 
  registerLimiter,
  validateInput,
  validateRegistrationData,
  authController.register
);

// ==================== LOGIN ====================
router.post('/login/socio', 
  authLimiter,
  validateInput,
  authController.loginSocio
);

router.post('/login/admin', 
  authLimiter,
  validateInput,
  authController.loginAdmin
);

// ==================== SESIÓN ====================
router.get('/verify', 
  authenticateAny,
  authController.verifySession
);

router.post('/logout', 
  authController.logout
);

// ==================== CAMBIAR CONTRASEÑA ====================
router.post('/change-password', 
  authenticateAny,
  validateInput,
  authController.changePassword
);

module.exports = router;
