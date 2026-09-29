-- 022_contact_email_and_profile_decisions.sql
--
-- Incidencias de la revisión de la junta directiva (sep 2026):
--
-- 1. Email profesional editable. `socios.email` sigue siendo el email de
--    acceso (login); `email_profesional` es el email profesional de
--    contacto, editable por el socio. `email_visible` indica qué email
--    (profesional/personal) se muestra en el directorio si el socio lo
--    autoriza; `email_preferido` (ya existente) indica dónde recibe avisos.
-- 2. `sexo` no se devolvía en la vista del perfil y la UI lo sobrescribía
--    con "Prefiero no decirlo" en el siguiente guardado. Se expone en la
--    nueva vista vista_socios_perfil.
-- 3. `preferencias_revisadas_at`: marca que el socio ha decidido
--    explícitamente (sí/no) visibilidad, segundo rol, disponibilidad,
--    colaboración, mensajería y email de contacto.
-- 4. `bienvenida_vista_at`: primer acceso con las fichas de tipo de socio.
-- 5. Plantillas de email configurables (confirmación, rechazo, avisos).
-- 6. Textos configurables de la landing pública rediseñada y de las fichas
--    "socio persona física" / "socio persona jurídica".
-- 7. Historial de comunicaciones masivas (trazabilidad RGPD por envío).
--
-- Aditiva e idempotente: no borra columnas ni reescribe contenido editado.

ALTER TABLE socios ADD COLUMN IF NOT EXISTS email_profesional VARCHAR(255);
UPDATE socios SET email_profesional = email WHERE email_profesional IS NULL;

ALTER TABLE socios ADD COLUMN IF NOT EXISTS email_visible VARCHAR(20) NOT NULL DEFAULT 'profesional';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'socios_email_visible_check') THEN
    ALTER TABLE socios ADD CONSTRAINT socios_email_visible_check
      CHECK (email_visible IN ('profesional','personal'));
  END IF;
END $$;
UPDATE socios SET email_preferido = 'profesional' WHERE email_preferido IS NULL;

ALTER TABLE socios ADD COLUMN IF NOT EXISTS bienvenida_vista_at TIMESTAMP;
ALTER TABLE consentimientos ADD COLUMN IF NOT EXISTS preferencias_revisadas_at TIMESTAMP;

-- Vista de perfil: vista_socios_completos + campos nuevos. Se crea como
-- vista aparte (y no ampliando la anterior) porque vista_stats_observatorio
-- depende de vista_socios_completos y porque así la migración 018 puede
-- reaplicarse sin conflicto de columnas. Nada depende de esta vista, por lo
-- que puede recrearse siempre.
DROP VIEW IF EXISTS vista_socios_perfil;
CREATE VIEW vista_socios_perfil AS
SELECT v.*,
  s.sexo, s.email_profesional, s.email_visible,
  c.acepta_notificaciones_email, c.mapa_visible, c.preferencias_revisadas_at,
  s.codigo_postal, s.direccion_completa, s.bienvenida_vista_at, s.punto_geografico
FROM vista_socios_completos v
JOIN socios s ON s.id = v.id
LEFT JOIN consentimientos c ON c.socio_id = v.id;

-- ==================== GEOLOCALIZACIÓN ====================
-- punto_geografico (PostGIS, usado por la búsqueda por radio) nunca se
-- rellenaba. Se mantiene sincronizado con latitud/longitud por trigger.
CREATE OR REPLACE FUNCTION socios_sync_punto_geografico() RETURNS trigger AS $$
BEGIN
  IF NEW.latitud IS NOT NULL AND NEW.longitud IS NOT NULL THEN
    NEW.punto_geografico := ST_SetSRID(ST_MakePoint(NEW.longitud::float8, NEW.latitud::float8), 4326);
  ELSE
    NEW.punto_geografico := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_socios_punto_geografico ON socios;
CREATE TRIGGER trg_socios_punto_geografico
  BEFORE INSERT OR UPDATE OF latitud, longitud ON socios
  FOR EACH ROW EXECUTE FUNCTION socios_sync_punto_geografico();
UPDATE socios SET punto_geografico = ST_SetSRID(ST_MakePoint(longitud::float8, latitud::float8), 4326)
WHERE latitud IS NOT NULL AND longitud IS NOT NULL AND punto_geografico IS NULL;

-- ==================== HISTORIAL DE COMUNICACIONES ====================
CREATE TABLE IF NOT EXISTS comunicaciones (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES administradores(id) ON DELETE SET NULL,
  asunto TEXT NOT NULL,
  cuerpo TEXT NOT NULL,
  filtros JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_destinatarios INTEGER NOT NULL DEFAULT 0,
  enviados INTEGER NOT NULL DEFAULT 0,
  fallidos INTEGER NOT NULL DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'en_cola'
    CHECK (estado IN ('en_cola','enviando','completada','con_errores')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS comunicacion_destinatarios (
  id SERIAL PRIMARY KEY,
  comunicacion_id INTEGER NOT NULL REFERENCES comunicaciones(id) ON DELETE CASCADE,
  socio_id INTEGER REFERENCES socios(id) ON DELETE SET NULL,
  provincia VARCHAR(50),
  email_destino VARCHAR(255) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aceptado','fallido')),
  error_code VARCHAR(40),
  sent_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_com_dest_comunicacion ON comunicacion_destinatarios(comunicacion_id);
CREATE INDEX IF NOT EXISTS idx_com_dest_provincia ON comunicacion_destinatarios(provincia);
CREATE INDEX IF NOT EXISTS idx_comunicaciones_admin ON comunicaciones(admin_id, created_at DESC);

-- ==================== PLANTILLAS DE EMAIL ====================
INSERT INTO landing_content (clave, valor) VALUES
  ('email.confirmation.subject',   'Hemos recibido tu solicitud · Mapa del Talento AGESPORT'),
  ('email.confirmation.heading',   'Solicitud recibida'),
  ('email.confirmation.greeting',  'Hola {nombre},'),
  ('email.confirmation.body',      'Gracias por solicitar tu alta en el Mapa del Talento de AGESPORT. La Gerencia revisará tus datos y te avisaremos por email en cuanto tu cuenta esté aprobada.'),
  ('email.confirmation.outro',     'Si no has sido tú quien ha hecho esta solicitud, responde a este correo o contacta con AGESPORT.'),
  ('email.confirmation.signature', 'Equipo AGESPORT'),

  ('email.rejection.subject',      'Información sobre tu solicitud en el Mapa del Talento AGESPORT'),
  ('email.rejection.heading',      'Información sobre tu solicitud'),
  ('email.rejection.greeting',     'Hola {nombre},'),
  ('email.rejection.intro',        'Tras revisar tu solicitud de alta en el Mapa del Talento de AGESPORT, no hemos podido aprobarla en este momento.'),
  ('email.rejection.motivo_label', 'Motivo:'),
  ('email.rejection.outro',        'Si crees que se trata de un error o quieres más información, puedes contactar con la Gerencia de AGESPORT.'),
  ('email.rejection.signature',    'Gracias por tu interés en AGESPORT.'),
  ('email.rejection.motivos',      'No consta como socio/a de AGESPORT|Datos incompletos o no verificables|Solicitud duplicada|Cuota pendiente de regularizar'),

  ('email.message.subject',        'Nuevo mensaje de {emisor} · AGESPORT'),
  ('email.message.intro',          '{emisor} te ha enviado un mensaje en el Mapa del Talento:'),
  ('email.message.cta',            'Ver el mensaje completo'),
  ('email.message.outro',          'Recibes este aviso porque lo tienes activado en tu perfil. Puedes desactivarlo o cambiar el email de avisos desde Mi perfil.')
ON CONFLICT (clave) DO NOTHING;

-- ==================== LANDING PÚBLICA (rediseño) ====================
INSERT INTO landing_content (clave, valor) VALUES
  ('hero.counter.label',     'profesionales del deporte ya forman parte del mapa'),
  ('hero.counter.provincias','provincias con socios'),
  ('hero.counter.roles',     'perfiles profesionales del clúster'),
  ('hero.visor.note',        'Datos agregados y actualizados en tiempo real. La identidad de cada socio sólo es visible dentro del área privada.'),
  ('mapa.h2',                'El talento, provincia a provincia'),
  ('mapa.lead',              'Pasa el cursor sobre cada provincia para ver cuántos socios hay y qué perfiles profesionales predominan.'),
  ('socio.h2',               '¿Qué tipo de socio eres?'),
  ('socio.lead',             'El Mapa del Talento reúne a personas y a organizaciones. Cada ficha recoge los datos adecuados a su naturaleza.')
ON CONFLICT (clave) DO NOTHING;

-- Fichas de tipo de socio. Textos provisionales hasta recibir las fichas
-- definitivas de AGESPORT: se editan desde Administración > Landing
-- pública y se muestran en la landing, en el registro y en el primer acceso.
INSERT INTO landing_content (clave, valor) VALUES
  ('fichas.fisica.title',  'Socio persona física'),
  ('fichas.fisica.body',   'Profesional que se asocia a título individual: gestores, técnicos, docentes, investigadores y otros perfiles del deporte. Su ficha recoge trayectoria, cargo, especialidades y disponibilidad para colaborar.'),
  ('fichas.fisica.items',  'Perfil profesional individual|Cargo, entidad y años de experiencia|Especialidades y disponibilidad (mentoría, ponencias…)|Contacto directo con otros socios'),
  ('fichas.juridica.title','Socio persona jurídica'),
  ('fichas.juridica.body', 'Organización que se asocia como entidad: empresas, clubes, federaciones, fundaciones o administraciones. Su ficha presenta la organización, su actividad en el clúster y una persona de contacto.'),
  ('fichas.juridica.items','Perfil de la organización|Rol en el clúster e intereses B2B|Persona de contacto designada|Visibilidad ante proveedores y colaboradores'),
  ('fichas.primer_acceso.title', 'Bienvenida/o al Mapa del Talento'),
  ('fichas.primer_acceso.body',  'Antes de empezar, revisa qué tipo de socio eres y completa tu perfil. Recuerda decidir si quieres aparecer en el directorio y en el mapa.')
ON CONFLICT (clave) DO NOTHING;
