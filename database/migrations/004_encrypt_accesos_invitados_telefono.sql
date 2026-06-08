-- Migration 004: cifrado de teléfono en `accesos_invitados`.
--
-- Contexto: `accesos_invitados` es la tabla de staging para CSVs importados
-- por admin. Hasta esta migración el campo `telefono` se guardaba en claro
-- durante el período de revisión, aunque ya estuviese cifrado en `socios`
-- (migración 002). Esta migración cierra ese gap.
--
-- Filas pendientes existentes con teléfono en claro se limpian a NULL antes
-- del DROP — el admin puede re-importar el CSV si lo necesita (es staging,
-- no datos transaccionales).
--
-- Idempotente.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accesos_invitados' AND column_name = 'telefono'
  ) THEN
    -- Limpiar filas con teléfono en claro para no perder PII al hacer DROP
    UPDATE accesos_invitados SET telefono = NULL WHERE telefono IS NOT NULL;
  END IF;
END $$;

ALTER TABLE accesos_invitados ADD COLUMN IF NOT EXISTS telefono_encrypted TEXT;
ALTER TABLE accesos_invitados DROP COLUMN IF EXISTS telefono;

COMMIT;
