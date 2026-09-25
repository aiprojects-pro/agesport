-- Preserve existing contact data; the legacy phone remains the professional phone.
BEGIN;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS telefono_personal_encrypted TEXT;
ALTER TABLE socios ADD COLUMN IF NOT EXISTS sector VARCHAR(30)
  CHECK (sector IN ('publico','privado','tercer_sector'));
UPDATE socios SET sector=CASE ambito::text WHEN 'Público' THEN 'publico' WHEN 'Privado' THEN 'privado' END WHERE sector IS NULL AND ambito::text IN ('Público','Privado');
ALTER TABLE consentimientos ADD COLUMN IF NOT EXISTS visible_telefono_personal BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rol_cluster ADD COLUMN IF NOT EXISTS rol_secundario VARCHAR(60)
  CHECK (rol_secundario IS NULL OR rol_secundario <> rol);
ALTER TABLE accesos_invitados ADD COLUMN IF NOT EXISTS telefono_personal_encrypted TEXT;
ALTER TABLE accesos_invitados ADD COLUMN IF NOT EXISTS sector VARCHAR(30);
ALTER TABLE accesos_invitados ADD COLUMN IF NOT EXISTS rol_secundario VARCHAR(60);
-- Keep unique ordering but allow every catalog specialty instead of cycling 1..3.
ALTER TABLE socio_especialidades DROP CONSTRAINT IF EXISTS socio_especialidades_orden_prioridad_check;
ALTER TABLE socio_especialidades ADD CONSTRAINT socio_especialidades_orden_prioridad_check CHECK (orden_prioridad > 0);
CREATE OR REPLACE VIEW vista_socios_completos AS
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

  s.created_at, s.ultimo_acceso,
  s.telefono_personal_encrypted, s.sector, rc.rol_secundario,
  c.visible_telefono_personal

FROM socios s
LEFT JOIN rol_cluster rc ON s.id = rc.socio_id
LEFT JOIN disponibilidad d ON s.id = d.socio_id
LEFT JOIN consentimientos c ON s.id = c.socio_id
WHERE s.estado = 'aprobado' AND s.activo = true;
COMMIT;
