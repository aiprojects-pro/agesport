-- Migration 013: UNIQUE en consentimientos.socio_id.
--
-- Bug latente: el código en `controllers/sociosController.js` (UPDATE
-- ... WHERE socio_id = $X) y en `controllers/authController.js`
-- (INSERT en el registro) asume que cada socio tiene EXACTAMENTE una
-- fila en `consentimientos`. Pero la tabla no tiene UNIQUE sobre
-- `socio_id` y, ante un fallo parcial del registro o una re-aprobación
-- manual, podrían existir dos filas — entonces `findOne` devolvería
-- una arbitraria y el UPDATE machacaría sólo una. Resultado: el socio
-- ve sus consentimientos correctos pero `filterSensitiveData` lee el
-- otro registro y oculta/muestra campos contradiciendo la elección.
--
-- Esta migración:
--   1. Deduplica filas — para cada socio con N>1 consentimientos,
--      conserva el MÁS RECIENTE (created_at DESC, id DESC) y borra
--      los anteriores. Auditoría: las filas borradas quedan visibles
--      en logs (NOTICE) para que un admin pueda revisarlas si hace
--      falta. Esto se ejecuta sólo si la columna `updated_at` o
--      `created_at` existe (se asume desde 001).
--   2. Añade el UNIQUE constraint sobre socio_id. Es idempotente
--      gracias a IF NOT EXISTS / pg_constraint check.
--
-- Idempotente: re-ejecutable sin error.

BEGIN;

DO $$
DECLARE
  dup_count INTEGER;
BEGIN
  -- Cuenta cuántos socios tienen >1 consentimientos.
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT socio_id FROM consentimientos
    GROUP BY socio_id HAVING COUNT(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Deduplicando consentimientos: % socios con duplicados', dup_count;
    -- ANTES de borrar, registramos las filas que vamos a eliminar en
    -- `auditoria` para que un admin pueda reconciliar manualmente si la
    -- fila más reciente tenía opt-ins MENOS permisivos que la antigua
    -- (p.ej. una re-registración que defaulteó acepta_mapa_interactivo
    -- a false sobreescribiendo una opt-in previa). Sin este log la
    -- elección se perdería silenciosamente.
    INSERT INTO auditoria (socio_id, accion, recurso, datos_anteriores, datos_nuevos)
    SELECT
      ranked.socio_id,
      'MIGRATION_013_DEDUP_CONSENTIMIENTOS',
      'consentimientos',
      to_jsonb(c) - 'id' - 'created_at' - 'updated_at',
      jsonb_build_object(
        'kept_consentimientos_id', ranked.kept_id,
        'deleted_consentimientos_id', c.id
      )
    FROM consentimientos c
    JOIN (
      SELECT
        id,
        socio_id,
        ROW_NUMBER() OVER (
          PARTITION BY socio_id
          ORDER BY fecha_consentimiento DESC NULLS LAST, id DESC
        ) AS rn,
        FIRST_VALUE(id) OVER (
          PARTITION BY socio_id
          ORDER BY fecha_consentimiento DESC NULLS LAST, id DESC
        ) AS kept_id
      FROM consentimientos
    ) ranked ON ranked.id = c.id
    WHERE ranked.rn > 1;

    -- Conserva la fila más reciente por socio (por fecha_consentimiento
    -- y, como tiebreak, id descendente). Borra el resto.
    DELETE FROM consentimientos c
    USING (
      SELECT id, socio_id,
             ROW_NUMBER() OVER (
               PARTITION BY socio_id
               ORDER BY fecha_consentimiento DESC NULLS LAST, id DESC
             ) AS rn
      FROM consentimientos
    ) ranked
    WHERE c.id = ranked.id AND ranked.rn > 1;
  END IF;
END $$;

-- Añade UNIQUE constraint si no existe ya — chequea por COLUMNA (no por
-- nombre) para evitar duplicar el constraint cuando el schema.sql ya lo
-- declara inline en CREATE TABLE (Postgres lo nombra entonces
-- `consentimientos_socio_id_key`).
DO $$
DECLARE
  has_unique BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'u'
      AND c.conrelid = 'consentimientos'::regclass
      AND a.attname = 'socio_id'
      AND array_length(c.conkey, 1) = 1
  ) INTO has_unique;

  IF NOT has_unique THEN
    ALTER TABLE consentimientos
      ADD CONSTRAINT consentimientos_socio_id_unique UNIQUE (socio_id);
  END IF;
END $$;

COMMIT;
