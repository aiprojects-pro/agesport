-- =============================================================================
-- MIGRACIÓN 001 — AGESPORT Mapa del Talento v2
-- =============================================================================
-- Cambios:
--   1. Amplía catálogo de roles (4 → 9) y especialidades (10 → 15).
--   2. Amplía provincias (8 andaluzas → todas las CCAA y provincias de España).
--   3. Añade tipos de socio (número, asociado corporativo, fundador, honor, colaborador).
--   4. Añade columnas email_personal, telefono, foto_url, cv_url, comunidad_autonoma,
--      tipo_socio, nombre_organizacion al perfil de socio.
--   5. Crea tabla organizacion_config (identidad de AGESPORT en el panel admin).
--   6. Crea tabla bajas_pendientes (gestión de solicitudes de baja).
--   7. Migra datos existentes desde los slugs antiguos a los nuevos.
--
-- IMPORTANTE: ejecutar en una sola transacción. Si algo falla, todo se revierte.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 0. Dependencias previas: dropear vistas que bloquean cambios de tipo
-- =============================================================================
DROP VIEW IF EXISTS vista_stats_observatorio;
DROP VIEW IF EXISTS vista_socios_completos;

-- =============================================================================
-- 1. Convertir columnas enum → VARCHAR para flexibilidad de catálogo
-- =============================================================================

-- rol_cluster.rol: enum → varchar
ALTER TABLE rol_cluster ALTER COLUMN rol TYPE VARCHAR(60) USING rol::TEXT;

-- socio_especialidades.especialidad: enum → varchar
ALTER TABLE socio_especialidades ALTER COLUMN especialidad TYPE VARCHAR(60) USING especialidad::TEXT;

-- Eliminar los enums antiguos (ahora unused)
DROP TYPE IF EXISTS rol_cluster_enum;
DROP TYPE IF EXISTS especialidad_enum;

-- =============================================================================
-- 2. Migración de datos: slugs legacy → nuevos
-- =============================================================================

UPDATE rol_cluster SET rol = CASE rol
  WHEN 'gestion'   THEN 'operador_deportivo'
  WHEN 'servicios' THEN 'proveedor_servicios_profesionales'
  WHEN 'infra'     THEN 'gestor_infraestructuras_instalaciones'
  WHEN 'tech'      THEN 'proveedor_tecnologico_innovacion'
  ELSE rol
END
WHERE rol IN ('gestion', 'servicios', 'infra', 'tech');

UPDATE socio_especialidades SET especialidad = CASE especialidad
  WHEN 'Gestión de Instalaciones'   THEN 'gestion_instalaciones'
  WHEN 'Organización de Eventos'    THEN 'organizacion_eventos'
  WHEN 'Derecho Deportivo'          THEN 'derecho_deportivo'
  WHEN 'Contratación y Patrimonio'  THEN 'contratacion_compras_patrimonio'
  WHEN 'Marketing y Patrocinio'     THEN 'marketing_comunicacion_patrocinio'
  WHEN 'Digitalización e IA'        THEN 'digitalizacion_datos_ia'
  WHEN 'Recursos Humanos'           THEN 'recursos_humanos_talento'
  WHEN 'Accesibilidad e Inclusión'  THEN 'accesibilidad_inclusion_igualdad'
  WHEN 'Actividad Física y Salud'   THEN 'actividad_fisica_salud_bienestar'
  WHEN 'Seguridad y Autoprotección' THEN 'seguridad_riesgos_autoproteccion'
  ELSE especialidad
END;

-- =============================================================================
-- 3. Nuevas columnas en `socios`
-- =============================================================================

ALTER TABLE socios
  ADD COLUMN IF NOT EXISTS tipo_socio VARCHAR(40) DEFAULT 'numero'
    CHECK (tipo_socio IN ('numero','asociado_corporativo','fundador','honor','colaborador')),
  ADD COLUMN IF NOT EXISTS email_personal VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email_preferido VARCHAR(20) DEFAULT 'profesional'
    CHECK (email_preferido IN ('profesional','personal')),
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(40), -- en claro para socios corporativos / contacto público
  ADD COLUMN IF NOT EXISTS foto_url TEXT,
  ADD COLUMN IF NOT EXISTS cv_url TEXT,
  ADD COLUMN IF NOT EXISTS comunidad_autonoma VARCHAR(60),
  ADD COLUMN IF NOT EXISTS nombre_organizacion VARCHAR(300); -- para socios corporativos

-- Rellenar comunidad_autonoma para registros existentes (todas las provincias andaluzas)
UPDATE socios SET comunidad_autonoma = 'andalucia'
WHERE comunidad_autonoma IS NULL
  AND provincia IN ('Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla');

CREATE INDEX IF NOT EXISTS idx_socios_comunidad ON socios(comunidad_autonoma);
CREATE INDEX IF NOT EXISTS idx_socios_tipo ON socios(tipo_socio);

-- =============================================================================
-- 4. Tabla `organizacion_config` (identidad de AGESPORT en panel admin)
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizacion_config (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL DEFAULT 'AGESPORT',
  tipo_organizacion VARCHAR(100) DEFAULT 'Asociación profesional',
  provincia VARCHAR(60),
  comunidad_autonoma VARCHAR(60),
  web_institucional TEXT,
  email_remitente VARCHAR(255), -- desde dónde se envían las notificaciones
  descripcion_breve TEXT,
  logo_url TEXT,
  colores_corporativos JSONB DEFAULT '["#0d355f","#6da93f","#37964f"]'::JSONB,
  updated_by INTEGER REFERENCES administradores(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fila por defecto (solo una; la app siempre lee la primera)
INSERT INTO organizacion_config (nombre, tipo_organizacion, comunidad_autonoma, web_institucional, descripcion_breve)
SELECT 'AGESPORT',
       'Asociación profesional',
       'andalucia',
       'https://agesport.org',
       'Asociación Andaluza de Gestores del Deporte'
WHERE NOT EXISTS (SELECT 1 FROM organizacion_config);

-- =============================================================================
-- 5. Tabla `bajas_pendientes` (gestión de solicitudes de baja por admin)
-- =============================================================================

CREATE TABLE IF NOT EXISTS bajas_pendientes (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  motivo TEXT,
  estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','en_revision','aprobada','rechazada')),
  notas_admin TEXT,
  fecha_solicitud TIMESTAMP DEFAULT NOW(),
  fecha_gestion TIMESTAMP,
  gestionado_por INTEGER REFERENCES administradores(id),
  llamada_realizada BOOLEAN DEFAULT false,
  fecha_llamada TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bajas_estado ON bajas_pendientes(estado);
CREATE INDEX IF NOT EXISTS idx_bajas_socio ON bajas_pendientes(socio_id);

-- =============================================================================
-- 6. Tabla `accesos_invitados` (importación masiva por admin)
-- =============================================================================
-- Almacena temporalmente las filas de un CSV subido antes de su aprobación final.
-- El admin puede revisarlas, descartar y aprobar las que quiera. Al aprobar,
-- se crea la fila correspondiente en `socios` con estado 'aprobado' y se envía email.

CREATE TABLE IF NOT EXISTS accesos_invitados (
  id SERIAL PRIMARY KEY,
  lote_id UUID DEFAULT gen_random_uuid(),
  nombre VARCHAR(100),
  apellidos VARCHAR(150),
  email VARCHAR(255),
  telefono VARCHAR(40),
  entidad VARCHAR(300),
  cargo_actual VARCHAR(200),
  provincia VARCHAR(60),
  comunidad_autonoma VARCHAR(60),
  rol_cluster VARCHAR(60),
  tipo_socio VARCHAR(40) DEFAULT 'numero',
  estado VARCHAR(20) DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobado','rechazado','duplicado')),
  errores JSONB,
  socio_creado_id INTEGER REFERENCES socios(id),
  subido_por INTEGER REFERENCES administradores(id),
  created_at TIMESTAMP DEFAULT NOW(),
  fecha_resolucion TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitados_lote ON accesos_invitados(lote_id);
CREATE INDEX IF NOT EXISTS idx_invitados_estado ON accesos_invitados(estado);
CREATE INDEX IF NOT EXISTS idx_invitados_email ON accesos_invitados(email);

-- =============================================================================
-- 7. Recrear las vistas con los nuevos campos
-- =============================================================================

CREATE OR REPLACE VIEW vista_socios_completos AS
SELECT
  s.id, s.email, s.email_personal, s.email_preferido,
  s.nombre, s.apellidos, s.tipo_socio, s.nombre_organizacion,
  s.entidad, s.web_profesional, s.telefono,
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

CREATE OR REPLACE VIEW vista_stats_observatorio AS
SELECT
  (SELECT COUNT(*) FROM socios WHERE estado = 'aprobado' AND activo = true) AS total_socios,
  (SELECT COUNT(DISTINCT provincia) FROM socios WHERE estado = 'aprobado' AND activo = true) AS provincias_activas,
  (SELECT COUNT(DISTINCT comunidad_autonoma) FROM socios WHERE estado = 'aprobado' AND activo = true) AS comunidades_activas,
  (SELECT COUNT(*) FROM vista_socios_completos WHERE disponibilidad = 'Alta') AS mentores_disponibles,
  (SELECT COUNT(*) FROM vista_socios_completos WHERE b2b_ofrece = true OR b2b_busca = true OR b2b_licita = true) AS proyectos_b2b,
  (SELECT COUNT(*) FROM socios WHERE estado = 'pendiente') AS socios_pendientes_aprobacion,
  (SELECT COUNT(*) FROM bajas_pendientes WHERE estado = 'pendiente') AS bajas_pendientes;

-- =============================================================================
-- 8. Limpieza de datos residuales (el "32 fantasma")
-- =============================================================================
-- Marca como inactivos los socios huérfanos (sin email válido o sin nombre).
-- No los borra para preservar auditoría; quedan invisibles en directorio y conteos.

UPDATE socios
SET activo = false, estado = 'rechazado',
    notas_moderacion = COALESCE(notas_moderacion,'') || ' [Limpieza automática v2: socio huérfano]'
WHERE (email IS NULL OR email = '' OR nombre IS NULL OR nombre = '')
  AND activo = true;

COMMIT;
