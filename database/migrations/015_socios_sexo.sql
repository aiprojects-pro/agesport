-- 015_socios_sexo.sql
-- Añade la columna `sexo` a la tabla `socios`.
--
-- Se guarda en texto libre acotado (VARCHAR 30) porque el frontend acepta
-- ahora los valores 'femenino' y 'masculino'. La ausencia de valor equivale
-- a "prefiere no decirlo" (NULL).
--
-- Sólo se usa para estadísticas agregadas del dashboard (no aparece en la
-- ficha pública de ningún socio).

ALTER TABLE socios ADD COLUMN IF NOT EXISTS sexo VARCHAR(30);

-- CHECK constraint opcional — evita basura si algún cliente antiguo envía
-- valores fuera del catálogo. Permite NULL (=prefiere no decirlo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'socios_sexo_check'
  ) THEN
    ALTER TABLE socios
      ADD CONSTRAINT socios_sexo_check
      CHECK (sexo IS NULL OR sexo IN ('femenino','masculino'));
  END IF;
END$$;
