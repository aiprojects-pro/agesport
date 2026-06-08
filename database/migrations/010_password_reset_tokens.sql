-- Migration 010: tabla password_reset_tokens.
--
-- Cada token vive 1h, es de un solo uso y se guarda hasheado (SHA-256)
-- en BD. Al socio se le envía el token en claro por email; el backend
-- compara hashes. Si el socio nunca usa el link, el token caduca y
-- queda inservible.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_socio ON password_reset_tokens(socio_id);
