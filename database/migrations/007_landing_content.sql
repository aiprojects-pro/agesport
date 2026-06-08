-- Migration 007: tabla `landing_content` para CMS de la landing pública.
--
-- Key/value editable desde el admin panel. Las claves siguen un patrón
-- "seccion.elemento.atributo" y se mapean a atributos `data-cms` en el
-- HTML. Los seeds reflejan el contenido inicial; admin puede sobrescribir
-- cualquier clave en cualquier momento.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS landing_content (
  clave VARCHAR(80) PRIMARY KEY,
  valor TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES administradores(id) ON DELETE SET NULL
);

-- ==================== HERO ====================

INSERT INTO landing_content (clave, valor) VALUES
  ('hero.eyebrow',    'Plataforma estratégica para AGESPORT'),
  ('hero.title',      'Conectar talento, territorio e industria del deporte andaluz.'),
  ('hero.lead',       'El Mapa del Talento AGESPORT organiza el capital profesional de la asociación, lo geolocaliza por provincia, lo hace visible dentro de un entorno privado y lo orienta a colaboración, networking inteligente y activación del clúster deportivo en Andalucía y el resto del territorio nacional.'),
  ('hero.cta1.label', 'Conocer el proyecto'),
  ('hero.cta2.label', 'Acceso socio'),
  ('hero.point1.title', 'Geolocalización profesional'),
  ('hero.point1.body',  'Quién es quién, dónde opera y en qué destaca.'),
  ('hero.point2.title', 'Clúster e industria'),
  ('hero.point2.body',  'Conexión entre gestión, servicios, tecnología, infraestructura, formación, eventos y más.'),
  ('hero.point3.title', 'Networking útil'),
  ('hero.point3.body',  'Filtros por provincia, especialidad y disponibilidad real.'),
  ('hero.point4.title', 'Observatorio sectorial'),
  ('hero.point4.body',  'Lectura territorial del ecosistema deportivo andaluz.'),
  ('hero.visor.caption', 'El visor del talento — provincias de Andalucía'),
  ('hero.stat1.value', '8'),
  ('hero.stat1.label', 'provincias andaluzas en una única capa de lectura.'),
  ('hero.stat2.value', '17 CCAA'),
  ('hero.stat2.label', 'cobertura ampliable al resto del territorio nacional.'),
  ('hero.stat3.value', 'Privado'),
  ('hero.stat3.label', 'acceso restringido a socios y administración.')
ON CONFLICT (clave) DO NOTHING;
