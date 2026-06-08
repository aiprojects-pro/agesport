-- Migration 011: tabla admin_password_reset_tokens.
--
-- Tabla paralela a password_reset_tokens (para socios) pero contra
-- administradores. La separación evita mezclar accidentalmente los dos
-- flujos en queries y mantiene el FK ON DELETE CASCADE limpio.
--
-- Estructura idéntica al equivalente de socios; los endpoints usan el
-- prefijo /api/auth/admin/* para distinguir.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES administradores(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_hash ON admin_password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_admin ON admin_password_reset_tokens(admin_id);
