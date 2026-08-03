-- 016_password_changed_at.sql
-- Añade columna `password_changed_at` a socios y administradores. Se usa
-- para invalidar sesiones (JWT) emitidas antes de un cambio de contraseña.
--
-- Regla en el middleware: si el token JWT tiene `iat < password_changed_at`,
-- se rechaza aunque el JWT sea válido criptográficamente. Cierra sesiones
-- abiertas al instante tras cambiar la password (o hacer reset).

ALTER TABLE socios
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT NOW();

ALTER TABLE administradores
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT NOW();

-- Backfill: cualquier fila existente adopta NOW() como referencia.
-- No importa que sean todas iguales — el objetivo es que los JWT
-- futuros comparados contra este timestamp funcionen bien.
UPDATE socios SET password_changed_at = COALESCE(password_changed_at, NOW())
  WHERE password_changed_at IS NULL;
UPDATE administradores SET password_changed_at = COALESCE(password_changed_at, NOW())
  WHERE password_changed_at IS NULL;
