// routes/auth.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const {
  authLimiter,
  loginIpLimiter,
  forgotPasswordLimiter,
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
// IMPORTANTE: validateInput corre ANTES de los limiters para que el
// keyGenerator vea el email ya sanitizado/normalizado. Antes, un
// atacante podía meter `<` u otros chars y conseguir slots distintos
// del cap.
// Doble cap encadenado:
//   1) authLimiter:    5 intentos/15min por IP+email (fuerza bruta cuenta)
//   2) loginIpLimiter: 20 intentos/15min por IP solo (credential stuffing
//      donde el atacante rota emails desde la misma IP)
router.post('/login/socio',
  validateInput,
  loginIpLimiter,
  authLimiter,
  authController.loginSocio
);

router.post('/login/admin',
  validateInput,
  loginIpLimiter,
  authLimiter,
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

// ==================== RECUPERACIÓN DE CONTRASEÑA ====================
// `forgotPasswordLimiter` (5 reqs/15min) NO usa skipSuccessfulRequests
// porque forgotPassword devuelve 200 SIEMPRE por seguridad — sin él,
// el rate-limit no se activaría nunca.
router.post('/forgot-password',
  validateInput,
  forgotPasswordLimiter,
  authController.forgotPassword
);

router.post('/reset-password',
  validateInput,
  authLimiter,
  authController.resetPassword
);

router.post('/admin/forgot-password',
  validateInput,
  forgotPasswordLimiter,
  authController.forgotPasswordAdmin
);

router.post('/admin/reset-password',
  validateInput,
  authLimiter,
  authController.resetPasswordAdmin
);

module.exports = router;
