-- Migration 008: extiende el CMS a las secciones restantes de la landing.
-- (hero ya cubierto en 007). Cubre topbar, proyecto, capacidades, fases,
-- estado y acceso/footer.
--
-- Idempotente (ON CONFLICT DO NOTHING).

INSERT INTO landing_content (clave, valor) VALUES
  -- ==================== TOPBAR ====================
  ('topbar.nav1.label', 'Conocer el proyecto'),
  ('topbar.nav2.label', 'Capacidades'),
  ('topbar.nav3.label', 'Implementación'),
  ('topbar.nav4.label', 'Acceso'),
  ('topbar.cta1.label', 'Acceso socio'),
  ('topbar.cta2.label', 'Acceso administración'),

  -- ==================== PROYECTO ====================
  ('proyecto.h2',   'Qué resuelve el Mapa del Talento'),
  ('proyecto.lead', 'Una infraestructura de relación para AGESPORT, el clúster y el tejido profesional del deporte andaluz. Identifica, valida y conecta a quienes hacen deporte posible en el territorio.'),
  ('proyecto.card1.tag',   'Propósito'),
  ('proyecto.card1.title', 'Identificar y ordenar el talento'),
  ('proyecto.card1.body',  'Ubica físicamente la actividad profesional de cada socio y la conecta con experiencia, cargo, entidad y especialización técnica.'),
  ('proyecto.card2.tag',   'Valor sectorial'),
  ('proyecto.card2.title', 'Activar sinergias reales'),
  ('proyecto.card2.body',  'Permite localizar expertos, colaboradores, mentores, consultores y agentes con capacidad de aportar a proyectos concretos.'),
  ('proyecto.card3.tag',   'Clúster'),
  ('proyecto.card3.title', 'Extender AGESPORT al ecosistema B2B'),
  ('proyecto.card3.body',  'Abre una lectura industrial del sector: gestión, proveedores, tecnología, servicios, formación, eventos y administración pública.'),

  -- ==================== CAPACIDADES ====================
  ('capacidades.h2',   'Capacidades planteadas'),
  ('capacidades.lead', 'La plataforma se articula en torno a capacidades de identificación, conexión, colaboración sectorial y lectura territorial del talento.'),
  ('capacidades.card1.title', 'Geolocalización profesional'),
  ('capacidades.card1.body',  'Dirección, localidad, provincia, comunidad autónoma y área de influencia para lectura territorial útil.'),
  ('capacidades.card2.title', 'Especialización por áreas'),
  ('capacidades.card2.body',  '15 especialidades: instalaciones, eventos, derecho, marketing, digitalización, RRHH, formación, sostenibilidad y más.'),
  ('capacidades.card3.title', 'Disponibilidad asociativa'),
  ('capacidades.card3.body',  'Mentorías, grupos de trabajo, ponencias y participación en iniciativas clave del clúster.'),
  ('capacidades.card4.title', 'Observatorio de gestión'),
  ('capacidades.card4.body',  'Lectura de densidad profesional, especialidades dominantes y peso territorial del ecosistema.'),

  -- ==================== FASES (Implementación) ====================
  ('fases.h2',   'Implementación en 4 fases'),
  ('fases.lead', 'La propuesta se organiza en cuatro etapas para estructurar la recogida de información, su validación, la visualización privada y la activación del ecosistema profesional.'),
  ('fases.fase1.title', 'Ficha del talento'),
  ('fases.fase1.body',  'Captura normalizada de datos de perfil profesional, especialidad, localización y relación con el clúster, con consentimientos RGPD explícitos.'),
  ('fases.fase2.title', 'Procesamiento y validación por AGESPORT'),
  ('fases.fase2.body',  'Revisión por Gerencia, alta del socio en el entorno privado y segmentación de la base para asegurar consistencia operativa.'),
  ('fases.fase3.title', 'Visualización privada del ecosistema'),
  ('fases.fase3.body',  'Acceso restringido para consulta del directorio, lectura del mapa territorial y localización de perfiles relevantes.'),
  ('fases.fase4.title', 'Dinamización del clúster'),
  ('fases.fase4.body',  'Activación del sistema como base de networking, asesoramiento, contacto directo entre socios y generación de oportunidades B2B.'),

  -- ==================== ESTADO PANEL ====================
  ('estado.titulo',    'Plataforma disponible'),
  ('estado.subtitulo', 'Entorno privado accesible con conexión segura'),
  ('estado.box1.label', 'Dominio'),
  ('estado.box1.value', 'agesport.aiprojects.pro'),
  ('estado.box2.label', 'HTTPS'),
  ('estado.box2.value', 'Let''s Encrypt activo'),
  ('estado.box3.label', 'Backend'),
  ('estado.box3.value', 'Node.js + PostgreSQL/PostGIS'),
  ('estado.box4.label', 'Proxy'),
  ('estado.box4.value', 'Nginx con redirección a HTTPS'),

  -- ==================== ACCESO (login panel) ====================
  ('acceso.h3',         'Acceso al entorno privado'),
  ('acceso.lead',       'Una vez dentro, accede al directorio del socio, al observatorio del talento, al visor gráfico y a la mensajería privada con el resto del clúster.'),
  ('acceso.cta1.label', 'Acceso socio'),
  ('acceso.cta2.label', 'Solicitar acceso'),
  ('acceso.cta3.label', 'Acceso administración'),

  -- ==================== FOOTER ====================
  ('footer.line1', 'AGESPORT · Mapa del Talento · Andalucía'),
  ('footer.line2', 'Plataforma privada orientada a conexión, conocimiento y activación sectorial.')
ON CONFLICT (clave) DO NOTHING;
