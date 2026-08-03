-- 017_password_changed_at_tz.sql
-- Cambia password_changed_at de TIMESTAMP a TIMESTAMPTZ. Sin zona horaria,
-- node-postgres reinterpreta el valor como hora local del cliente y aplica
-- un offset erróneo, invalidando el fix de invalidación de sesiones al
-- cambiar contraseña. Con TIMESTAMPTZ el driver devuelve el instante UTC
-- correcto y toISOString() da el epoch real.

ALTER TABLE socios
  ALTER COLUMN password_changed_at TYPE TIMESTAMPTZ USING password_changed_at AT TIME ZONE 'UTC';

ALTER TABLE administradores
  ALTER COLUMN password_changed_at TYPE TIMESTAMPTZ USING password_changed_at AT TIME ZONE 'UTC';
