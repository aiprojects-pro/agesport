-- Migration 014: extender el CHECK de `accesos_invitados.estado` para
-- aceptar `'con_errores'`. Esto permite marcar filas que NO pasaron la
-- validación durante el import (provincia inválida, rol_cluster
-- inválido, etc.) y que el flujo `aprobarAccesoInvitado` rechace su
-- aprobación. Antes, esas filas se guardaban con estado='pendiente' y
-- el admin podía aprobarlas → `socios` aceptaba el INSERT (provincia
-- es VARCHAR libre) → datos basura en la BD.
--
-- Idempotente: chequea si ya existe un CHECK sobre la columna `estado`
-- que incluya 'con_errores' antes de modificar nada.
--
-- IMPORTANTE: identificamos el CHECK a borrar por COLUMNA (conkey),
-- no por un LIKE sobre el texto del constraint. Un LIKE '%estado%'
-- matchearía cualquier CHECK que mencione la palabra "estado" en su
-- definición — p. ej. uno futuro sobre `fecha_estado_change`.

BEGIN;

DO $$
DECLARE
  estado_col_attnum INTEGER;
  existing_conname TEXT;
  existing_def TEXT;
BEGIN
  -- attnum de la columna `estado` en `accesos_invitados`.
  SELECT a.attnum INTO estado_col_attnum
  FROM pg_attribute a
  WHERE a.attrelid = 'accesos_invitados'::regclass
    AND a.attname = 'estado'
    AND NOT a.attisdropped;

  -- ¿Hay ya un CHECK sobre exactamente la columna `estado` y nada más?
  SELECT c.conname, pg_get_constraintdef(c.oid)
    INTO existing_conname, existing_def
  FROM pg_constraint c
  WHERE c.conrelid = 'accesos_invitados'::regclass
    AND c.contype = 'c'
    AND c.conkey = ARRAY[estado_col_attnum]::smallint[]
  LIMIT 1;

  IF existing_conname IS NULL THEN
    -- No había ningún CHECK previo sobre `estado` (raro, pero posible
    -- si alguien lo dropeó manualmente). Lo creamos.
    ALTER TABLE accesos_invitados
      ADD CONSTRAINT accesos_invitados_estado_check
      CHECK (estado IN ('pendiente','aprobado','rechazado','duplicado','con_errores'));
  ELSIF existing_def LIKE '%con_errores%' THEN
    -- Ya está al día — no-op idempotente.
    NULL;
  ELSE
    -- Drop del antiguo (que NO incluye 'con_errores') y create del nuevo.
    EXECUTE format('ALTER TABLE accesos_invitados DROP CONSTRAINT %I', existing_conname);
    ALTER TABLE accesos_invitados
      ADD CONSTRAINT accesos_invitados_estado_check
      CHECK (estado IN ('pendiente','aprobado','rechazado','duplicado','con_errores'));
  END IF;
END $$;

COMMIT;
