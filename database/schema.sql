-- MAPA DEL TALENTO AGESPORT - Schema de Base de Datos
-- PostgreSQL con extensión PostGIS para geolocalización

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum types
CREATE TYPE ambito_enum AS ENUM ('Público', 'Privado', 'Mixto / Otros');
CREATE TYPE rol_cluster_enum AS ENUM ('gestion', 'servicios', 'infra', 'tech');
CREATE TYPE disponibilidad_enum AS ENUM ('Alta', 'Media', 'Puntual');
CREATE TYPE impacto_enum AS ENUM ('Local', 'Provincial/Regional', 'Nacional/Internacional');
CREATE TYPE estado_socio_enum AS ENUM ('pendiente', 'aprobado', 'rechazado', 'suspendido');
CREATE TYPE especialidad_enum AS ENUM (
  'Gestión de Instalaciones',
  'Organización de Eventos', 
  'Derecho Deportivo',
  'Contratación y Patrimonio',
  'Marketing y Patrocinio',
  'Digitalización e IA',
  'Recursos Humanos',
  'Accesibilidad e Inclusión',
  'Actividad Física y Salud',
  'Seguridad y Autoprotección'
);

-- ==================== TABLA PRINCIPAL SOCIOS ====================
CREATE TABLE socios (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  
  -- Datos personales (sección 1 ficha técnica)
  nombre VARCHAR(100) NOT NULL,
  apellidos VARCHAR(150) NOT NULL,
  dni_nie_encrypted TEXT, -- cifrado AES
  telefono_encrypted TEXT, -- cifrado AES
  linkedin_url TEXT,
  otras_redes TEXT,
  
  -- Datos profesionales (secciones 2-3)
  entidad VARCHAR(300),
  web_profesional TEXT,
  provincia VARCHAR(50) NOT NULL,
  localidad VARCHAR(100) NOT NULL,
  codigo_postal VARCHAR(10),
  direccion_completa TEXT,
  ambito ambito_enum,
  cargo_actual VARCHAR(200),
  anos_experiencia INTEGER CHECK (anos_experiencia >= 0 AND anos_experiencia <= 50),
  
  -- Geolocalización
  latitud DECIMAL(10,8),
  longitud DECIMAL(11,8),
  punto_geografico GEOMETRY(POINT, 4326),
  
  -- Estado y moderación
  estado estado_socio_enum DEFAULT 'pendiente',
  fecha_registro TIMESTAMP DEFAULT NOW(),
  fecha_aprobacion TIMESTAMP,
  aprobado_por INTEGER, -- referencia a admin
  notas_moderacion TEXT,
  
  -- Control de sesión
  ultimo_acceso TIMESTAMP,
  activo BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices espaciales y de búsqueda
CREATE INDEX idx_socios_punto_geografico ON socios USING GIST(punto_geografico);
CREATE INDEX idx_socios_estado ON socios(estado);
CREATE INDEX idx_socios_provincia ON socios(provincia);
CREATE INDEX idx_socios_email ON socios(email);
CREATE INDEX idx_socios_search ON socios USING GIN(to_tsvector('spanish', nombre || ' ' || apellidos || ' ' || COALESCE(entidad, '')));

-- ==================== ROL EN EL CLÚSTER ====================
CREATE TABLE rol_cluster (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  rol rol_cluster_enum NOT NULL,
  
  -- Intereses B2B (sección 4 ficha)
  b2b_ofrece BOOLEAN DEFAULT false,
  b2b_busca BOOLEAN DEFAULT false,
  b2b_licita BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== ESPECIALIDADES ====================
CREATE TABLE socio_especialidades (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  especialidad especialidad_enum NOT NULL,
  orden_prioridad INTEGER CHECK (orden_prioridad BETWEEN 1 AND 3),
  
  UNIQUE(socio_id, especialidad),
  UNIQUE(socio_id, orden_prioridad)
);

-- ==================== PROYECTOS DE INNOVACIÓN ====================
CREATE TABLE proyectos_innovacion (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  descripcion TEXT,
  tecnologias TEXT,
  impacto impacto_enum,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- ==================== DISPONIBILIDAD ====================
CREATE TABLE disponibilidad (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  nivel disponibilidad_enum NOT NULL,
  
  -- Detalles participación (sección 7 ficha)
  ponente BOOLEAN DEFAULT false,
  tutor_mentor BOOLEAN DEFAULT false,
  asistente BOOLEAN DEFAULT false,
  congreso_almeria BOOLEAN DEFAULT false,
  representacion BOOLEAN DEFAULT false,
  captacion_patrocinio BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ==================== CONSENTIMIENTOS RGPD ====================
CREATE TABLE consentimientos (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  
  -- Consentimiento principal (sección 8 ficha)
  acepta_mapa_interactivo BOOLEAN NOT NULL DEFAULT false,
  acepta_visibilidad_datos BOOLEAN NOT NULL DEFAULT false,
  acepta_mensajeria BOOLEAN DEFAULT true,
  acepta_notificaciones_email BOOLEAN DEFAULT false,
  
  -- Granularidad de visibilidad
  visible_telefono BOOLEAN DEFAULT false,
  visible_email_directo BOOLEAN DEFAULT false,
  visible_direccion_completa BOOLEAN DEFAULT false,
  visible_web_profesional BOOLEAN DEFAULT true,
  visible_linkedin BOOLEAN DEFAULT true,
  
  fecha_consentimiento TIMESTAMP DEFAULT NOW(),
  ip_consentimiento INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ==================== MENSAJERÍA INTERNA ====================
CREATE TABLE conversaciones (
  id SERIAL PRIMARY KEY,
  socio_1_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  socio_2_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CHECK (socio_1_id < socio_2_id), -- evitar duplicados
  UNIQUE(socio_1_id, socio_2_id)
);

CREATE TABLE mensajes (
  id SERIAL PRIMARY KEY,
  conversacion_id INTEGER REFERENCES conversaciones(id) ON DELETE CASCADE,
  emisor_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  receptor_id INTEGER REFERENCES socios(id) ON DELETE CASCADE,
  
  contenido TEXT NOT NULL,
  leido BOOLEAN DEFAULT false,
  fecha_lectura TIMESTAMP,
  
  -- Moderación
  reportado BOOLEAN DEFAULT false,
  moderado BOOLEAN DEFAULT false,
  motivo_moderacion TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_mensajes_conversacion ON mensajes(conversacion_id, created_at);
CREATE INDEX idx_mensajes_no_leidos ON mensajes(receptor_id, leido) WHERE leido = false;

-- ==================== ADMINISTRADORES ====================
CREATE TABLE administradores (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  rol VARCHAR(50) DEFAULT 'admin', -- admin, superadmin, moderador
  activo BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  ultimo_acceso TIMESTAMP
);

-- ==================== AUDITORÍA RGPD ====================
CREATE TABLE auditoria (
  id SERIAL PRIMARY KEY,
  socio_id INTEGER REFERENCES socios(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES administradores(id) ON DELETE SET NULL,
  
  accion VARCHAR(100) NOT NULL, -- login, profile_view, data_export, etc.
  recurso VARCHAR(100), -- tabla afectada
  datos_anteriores JSONB, -- para rollbacks
  datos_nuevos JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_auditoria_socio ON auditoria(socio_id, created_at);
CREATE INDEX idx_auditoria_fecha ON auditoria(created_at);

-- ==================== CONFIGURACIÓN SISTEMA ====================
CREATE TABLE configuracion (
  id SERIAL PRIMARY KEY,
  clave VARCHAR(100) UNIQUE NOT NULL,
  valor TEXT,
  descripcion TEXT,
  tipo VARCHAR(20) DEFAULT 'string', -- string, number, boolean, json
  
  updated_by INTEGER REFERENCES administradores(id),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Configuración inicial
INSERT INTO configuracion (clave, valor, descripcion, tipo) VALUES 
('dashboard_kpis_activos', '["total_socios","provincias_activas","mentores_disponibles","proyectos_b2b"]', 'KPIs activos en dashboard', 'json'),
('top_especialidades_cantidad', '6', 'Número de especialidades en gráfico', 'number'),
('mensajeria_activa', 'true', 'Sistema de mensajería habilitado', 'boolean'),
('moderacion_automatica', 'false', 'Aprobación automática de socios', 'boolean'),
('geocoding_service', 'nominatim', 'Servicio de geocodificación', 'string');

-- ==================== TRIGGERS Y FUNCIONES ====================

-- Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
CREATE TRIGGER update_socios_modtime BEFORE UPDATE ON socios FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_disponibilidad_modtime BEFORE UPDATE ON disponibilidad FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_consentimientos_modtime BEFORE UPDATE ON consentimientos FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER update_conversaciones_modtime BEFORE UPDATE ON conversaciones FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- Función para generar punto geográfico automáticamente
CREATE OR REPLACE FUNCTION generar_punto_geografico()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitud IS NOT NULL AND NEW.longitud IS NOT NULL THEN
        NEW.punto_geografico = ST_SetSRID(ST_MakePoint(NEW.longitud, NEW.latitud), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generar_punto_geografico 
    BEFORE INSERT OR UPDATE ON socios 
    FOR EACH ROW EXECUTE FUNCTION generar_punto_geografico();

-- Función para auditoría automática
CREATE OR REPLACE FUNCTION registrar_auditoria()
RETURNS TRIGGER AS $$
DECLARE
    accion_tipo VARCHAR(50);
BEGIN
    IF TG_OP = 'INSERT' THEN
        accion_tipo = 'CREATE';
    ELSIF TG_OP = 'UPDATE' THEN
        accion_tipo = 'UPDATE';
    ELSIF TG_OP = 'DELETE' THEN
        accion_tipo = 'DELETE';
    END IF;
    
    INSERT INTO auditoria (socio_id, accion, recurso, datos_anteriores, datos_nuevos, ip_address)
    VALUES (
        CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE COALESCE(NEW.id, OLD.id) END,
        accion_tipo,
        TG_TABLE_NAME,
        CASE WHEN TG_OP = 'DELETE' THEN row_to_json(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN row_to_json(NEW) ELSE NULL END,
        inet_client_addr()
    );
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger de auditoría en tabla principal
CREATE TRIGGER trigger_auditoria_socios 
    AFTER INSERT OR UPDATE OR DELETE ON socios 
    FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- ==================== DATOS INICIALES ====================

-- Administrador por defecto
INSERT INTO administradores (email, password_hash, nombre, rol) VALUES 
('admin@agesport.org', '$2b$12$example_hash_change_in_production', 'Administrador AGESPORT', 'superadmin');

-- Provincias y coordenadas para referencia
CREATE TABLE provincias_referencia (
  provincia VARCHAR(50) PRIMARY KEY,
  latitud DECIMAL(10,8),
  longitud DECIMAL(11,8),
  capital VARCHAR(50)
);

INSERT INTO provincias_referencia VALUES 
('Almería', 36.8381, -2.4597, 'Almería'),
('Cádiz', 36.5271, -6.2886, 'Cádiz'),
('Córdoba', 37.8882, -4.7794, 'Córdoba'),
('Granada', 37.1773, -3.5986, 'Granada'),
('Huelva', 37.2571, -6.9495, 'Huelva'),
('Jaén', 37.7796, -3.7849, 'Jaén'),
('Málaga', 36.7213, -4.4214, 'Málaga'),
('Sevilla', 37.3891, -5.9845, 'Sevilla');

-- ==================== VISTAS ÚTILES ====================

-- Vista con datos completos del socio (para API)
DROP VIEW IF EXISTS vista_stats_observatorio;
DROP VIEW IF EXISTS vista_socios_completos;

CREATE VIEW vista_socios_completos AS
SELECT 
  s.id, s.email, s.nombre, s.apellidos, s.entidad, s.web_profesional,
  s.provincia, s.localidad, s.ambito, s.cargo_actual, s.anos_experiencia,
  s.latitud, s.longitud, s.estado, s.linkedin_url, s.otras_redes,
  
  -- Rol cluster
  rc.rol as rol_cluster, rc.b2b_ofrece, rc.b2b_busca, rc.b2b_licita,
  
  -- Disponibilidad  
  d.nivel as disponibilidad, d.ponente, d.tutor_mentor, d.asistente,
  d.congreso_almeria, d.representacion, d.captacion_patrocinio,
  
  -- Especialidades (como array)
  COALESCE((
    SELECT array_agg(se2.especialidad ORDER BY se2.orden_prioridad)
    FROM socio_especialidades se2
    WHERE se2.socio_id = s.id
  ), ARRAY[]::especialidad_enum[]) as especialidades,
  
  -- Consentimientos
  c.acepta_mapa_interactivo, c.acepta_visibilidad_datos, c.acepta_mensajeria,
  c.visible_telefono, c.visible_email_directo, c.visible_web_profesional, c.visible_linkedin,
  
  -- Proyectos (como array)
  COALESCE((
    SELECT array_agg(pi2.descripcion ORDER BY pi2.id)
    FROM proyectos_innovacion pi2
    WHERE pi2.socio_id = s.id
      AND pi2.descripcion IS NOT NULL
  ), ARRAY[]::text[]) as proyectos_innovacion,
  
  s.created_at, s.ultimo_acceso
  
FROM socios s
LEFT JOIN rol_cluster rc ON s.id = rc.socio_id  
LEFT JOIN disponibilidad d ON s.id = d.socio_id
LEFT JOIN consentimientos c ON s.id = c.socio_id
WHERE s.estado = 'aprobado' AND s.activo = true
;

-- Vista para dashboard/observatorio
CREATE VIEW vista_stats_observatorio AS
SELECT 
  (SELECT COUNT(*) FROM socios WHERE estado = 'aprobado' AND activo = true) as total_socios,
  (SELECT COUNT(DISTINCT provincia) FROM socios WHERE estado = 'aprobado' AND activo = true) as provincias_activas,
  (SELECT COUNT(*) FROM vista_socios_completos WHERE disponibilidad = 'Alta') as mentores_disponibles,
  (SELECT COUNT(*) FROM vista_socios_completos WHERE b2b_ofrece = true OR b2b_busca = true OR b2b_licita = true) as proyectos_b2b,
  (SELECT COUNT(*) FROM socios WHERE estado = 'pendiente') as socios_pendientes_aprobacion;
