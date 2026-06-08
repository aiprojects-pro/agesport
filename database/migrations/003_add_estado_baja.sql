-- Migration 003: añade 'baja' al enum `estado_socio_enum`.
--
-- Contexto: hasta esta migración el flujo de baja voluntaria (gestionarBaja)
-- marcaba al socio como `estado='rechazado'`, lo que confunde con el
-- "rechazado en alta". `'baja'` distingue una salida voluntaria (RGPD)
-- de un rechazo administrativo durante el registro.
--
-- Idempotente: `ADD VALUE IF NOT EXISTS`.
-- No requiere bloque transaccional (PG 12+ lo permite, pero evitamos
-- BEGIN/COMMIT por compatibilidad con servidores más viejos).

ALTER TYPE estado_socio_enum ADD VALUE IF NOT EXISTS 'baja';
