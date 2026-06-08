-- Migration 002: telefono solo cifrado en `socios`
--
-- Contexto: la migración 001 introdujo `socios.telefono` en claro junto a
-- `socios.telefono_encrypted`, creando una doble fuente de la verdad. Esta
-- migración elimina la columna en claro. La visibilidad del teléfono entre
-- socios queda controlada por `consentimientos.visible_telefono` (RGPD).
--
-- PRE-REQUISITO: ejecutar `npm run db:backfill-telefono` ANTES de aplicar
-- esta migración. Cifra cualquier fila que tuviera `telefono` no nulo pero
-- `telefono_encrypted` nulo. La verificación de abajo aborta si hay huérfanos.
--
-- Idempotente: re-ejecutable sin efectos secundarios.

BEGIN;

-- 1. Guardia: abortar si quedan filas con teléfono en claro sin cifrar.
--    Idempotente: si la columna ya no existe, la migración ya fue aplicada.
DO $$
DECLARE
  missing_count integer;
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'socios' AND column_name = 'telefono'
  ) INTO col_exists;

  IF NOT col_exists THEN
    RAISE NOTICE 'socios.telefono ya no existe — migración 002 previamente aplicada';
    RETURN;
  END IF;

  EXECUTE 'SELECT COUNT(*) FROM socios WHERE telefono IS NOT NULL AND telefono_encrypted IS NULL'
    INTO missing_count;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Hay % filas con telefono en claro sin cifrar. Ejecuta `npm run db:backfill-telefono` antes de aplicar la migración.',
      missing_count;
  END IF;
END $$;

-- 2. Recrear `vista_socios_completos` exponiendo `telefono_encrypted`.
--    CREATE OR REPLACE no permite cambiar nombres de columnas, así que
--    hacemos DROP CASCADE (también arrastra `vista_stats_observatorio`,
--    que la recreamos a continuación).
DROP VIEW IF EXISTS vista_socios_completos CASCADE;

CREATE VIEW vista_socios_completos AS
SELECT
  s.id, s.email, s.email_personal, s.email_preferido,
  s.nombre, s.apellidos, s.tipo_socio, s.nombre_organizacion,
  s.entidad, s.web_profesional, s.telefono_encrypted,
  s.provincia, s.comunidad_autonoma, s.localidad, s.ambito,
  s.cargo_actual, s.anos_experiencia,
  s.latitud, s.longitud,
  s.estado, s.linkedin_url, s.otras_redes,
  s.foto_url, s.cv_url,

  rc.rol AS rol_cluster, rc.b2b_ofrece, rc.b2b_busca, rc.b2b_licita,

  d.nivel AS disponibilidad, d.ponente, d.tutor_mentor, d.asistente,
  d.congreso_almeria, d.representacion, d.captacion_patrocinio,

  COALESCE((
    SELECT array_agg(se2.especialidad ORDER BY se2.orden_prioridad)
    FROM socio_especialidades se2 WHERE se2.socio_id = s.id
  ), ARRAY[]::VARCHAR[]) AS especialidades,

  c.acepta_mapa_interactivo, c.acepta_visibilidad_datos, c.acepta_mensajeria,
  c.visible_telefono, c.visible_email_directo, c.visible_web_profesional, c.visible_linkedin,

  COALESCE((
    SELECT array_agg(pi2.descripcion ORDER BY pi2.id)
    FROM proyectos_innovacion pi2
    WHERE pi2.socio_id = s.id AND pi2.descripcion IS NOT NULL
  ), ARRAY[]::TEXT[]) AS proyectos_innovacion,

  s.created_at, s.ultimo_acceso

FROM socios s
LEFT JOIN rol_cluster rc ON s.id = rc.socio_id
LEFT JOIN disponibilidad d ON s.id = d.socio_id
LEFT JOIN consentimientos c ON s.id = c.socio_id
WHERE s.estado = 'aprobado' AND s.activo = true;

-- 3. Recrear la vista dependiente
CREATE VIEW vista_stats_observatorio AS
SELECT
  (SELECT COUNT(*) FROM socios WHERE estado = 'aprobado' AND activo = true) AS total_socios,
  (SELECT COUNT(DISTINCT provincia) FROM socios WHERE estado = 'aprobado' AND activo = true) AS provincias_activas,
  (SELECT COUNT(DISTINCT comunidad_autonoma) FROM socios WHERE estado = 'aprobado' AND activo = true) AS comunidades_activas,
  (SELECT COUNT(*) FROM vista_socios_completos WHERE disponibilidad = 'Alta') AS mentores_disponibles,
  (SELECT COUNT(*) FROM vista_socios_completos WHERE b2b_ofrece = true OR b2b_busca = true OR b2b_licita = true) AS proyectos_b2b,
  (SELECT COUNT(*) FROM socios WHERE estado = 'pendiente') AS socios_pendientes_aprobacion,
  (SELECT COUNT(*) FROM bajas_pendientes WHERE estado = 'pendiente') AS bajas_pendientes;

-- 4. Eliminar la columna en claro
ALTER TABLE socios DROP COLUMN IF EXISTS telefono;

COMMIT;
