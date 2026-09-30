-- 023_fichas_socio_agesport.sql
--
-- Contenido definitivo de las fichas "Socio/a de número" y "Socio
-- corporativo" facilitadas por AGESPORT (sep 2026).
--
-- Formato de las claves editables (Administración > Landing pública):
--   fichas.<tipo>.bloques      Un bloque por línea: "Título: ventaja | ventaja | …"
--   fichas.<tipo>.compromisos  Compromisos separados por "|"
--   fichas.<tipo>.cuota / .link  Opcionales; vacíos no se muestran.
--
-- Sólo se sustituyen los textos provisionales de la migración 022; si el
-- contenido ya se ha editado desde administración, se conserva.

UPDATE landing_content SET valor = 'Socio/a de número', updated_at = NOW()
 WHERE clave = 'fichas.fisica.title' AND valor = 'Socio persona física';
UPDATE landing_content SET valor = 'Figura dirigida a profesionales que desean formar parte de la principal red profesional de gestión deportiva de Andalucía, participar en las actividades de AGESPORT y contribuir al cumplimiento de su misión, visión y valores.', updated_at = NOW()
 WHERE clave = 'fichas.fisica.body' AND valor LIKE 'Profesional que se asocia a título individual:%';
UPDATE landing_content SET valor = 'Socio corporativo', updated_at = NOW()
 WHERE clave = 'fichas.juridica.title' AND valor = 'Socio persona jurídica';
UPDATE landing_content SET valor = 'Figura dirigida a empresas, entidades, consultoras, organizaciones deportivas, universidades, fundaciones, federaciones y administraciones que desean formar parte de la principal red profesional de gestión deportiva de Andalucía.', updated_at = NOW()
 WHERE clave = 'fichas.juridica.body' AND valor LIKE 'Organización que se asocia como entidad:%';
UPDATE landing_content SET valor = 'Antes de empezar, repasa las ventajas y compromisos de tu tipo de socio y completa tu perfil. Recuerda decidir si quieres aparecer en el directorio y en el mapa.', updated_at = NOW()
 WHERE clave = 'fichas.primer_acceso.body' AND valor LIKE 'Antes de empezar, revisa qué tipo de socio eres%';
-- La lista breve anterior queda sustituida por los bloques de ventajas.
UPDATE landing_content SET valor = '', updated_at = NOW()
 WHERE clave IN ('fichas.fisica.items', 'fichas.juridica.items')
   AND valor IN (
     'Perfil profesional individual|Cargo, entidad y años de experiencia|Especialidades y disponibilidad (mentoría, ponencias…)|Contacto directo con otros socios',
     'Perfil de la organización|Rol en el clúster e intereses B2B|Persona de contacto designada|Visibilidad ante proveedores y colaboradores');
UPDATE landing_content SET valor = 'Socios y socias de AGESPORT', updated_at = NOW()
 WHERE clave = 'socio.h2' AND valor = '¿Qué tipo de socio eres?';
UPDATE landing_content SET valor = 'Dos formas de formar parte de la principal red profesional de gestión deportiva de Andalucía: como profesional o como entidad. Consulta las ventajas y compromisos de cada una.', updated_at = NOW()
 WHERE clave = 'socio.lead' AND valor LIKE 'El Mapa del Talento reúne a personas y a organizaciones.%';

INSERT INTO landing_content (clave, valor) VALUES
  ('fichas.fisica.tagline', 'Profesionales comprometidos con la gestión deportiva en Andalucía'),
  ('fichas.fisica.perfil', ''),
  ('fichas.fisica.bloques', E'Visibilidad y reconocimiento: Reconocimiento de socio/a de número AGESPORT, pudiendo mencionarlo y hacerlo constar en su perfil profesional (CV, LinkedIn, etc.) | Presencia, como socio/a, dentro del Mapa del Talento AGESPORT\nNetworking y relaciones: Participación en todas las actividades de AGESPORT | Proponer y participar en procesos de networking | Disfrute de los beneficios de los acuerdos comerciales alcanzados por AGESPORT\nConocimiento y desarrollo: Recepción de comunicaciones de AGESPORT por cualquier medio: publicaciones, estudios, informes, ofertas o demandas de trabajo, formación, entre otros | Consulta de los fondos documentales de AGESPORT\nParticipación asociativa: Presentación de propuestas, mociones y memorias ante los órganos de gobierno, de acuerdo a los Estatutos | Derecho a voto en las Asambleas Generales y en el proceso electoral de AGESPORT'),
  ('fichas.fisica.compromisos', 'Estar al corriente de pago de las cuotas anuales | Colaborar, en la medida de sus posibilidades, en el desarrollo de AGESPORT y en el cumplimiento de su misión, visión y valores'),
  ('fichas.fisica.cuota', '100 € / año'),
  ('fichas.fisica.link', ''),
  ('fichas.juridica.tagline', 'Empresas, entidades e instituciones comprometidas con la gestión deportiva en Andalucía'),
  ('fichas.juridica.perfil', 'Empresas de servicios deportivos, consultoras, gestoras de instalaciones, federaciones, universidades, fundaciones, administraciones públicas y empresas colaboradoras del deporte.'),
  ('fichas.juridica.bloques', E'Visibilidad y posicionamiento: Reconocimiento oficial como Entidad Asociada a AGESPORT | Uso de la identificación «Socio Corporativo AGESPORT» en soportes corporativos | Presencia destacada en el Directorio de Entidades Asociadas | Difusión de actividades e iniciativas a través de los canales de AGESPORT | Publicación de hasta dos artículos anuales en la Newsletter\nParticipación asociativa: Presentación de propuestas ante los órganos de gobierno | Derecho a voto en Asambleas Generales mediante representante | Participación en procesos electorales\nNetworking y relaciones: Participación en encuentros profesionales, jornadas y congresos | Acceso a espacios de networking con gestores y entidades del sector | Participación en grupos de trabajo y proyectos colaborativos\nConocimiento y desarrollo: Recepción de publicaciones, estudios e informes especializados | Acceso preferente a actividades formativas | Consulta de recursos técnicos y documentales | Información sobre oportunidades de colaboración y empleo'),
  ('fichas.juridica.compromisos', 'Estar al corriente de las cuotas asociativas | Compartir la misión, visión y valores de AGESPORT | Colaborar en el desarrollo de actividades y proyectos | Participar activamente en la vida asociativa | Mantener actualizados los datos de contacto y representación'),
  ('fichas.juridica.cuota', '250 € / año'),
  ('fichas.juridica.link', 'https://agesport.org/socios-corporativos')
ON CONFLICT (clave) DO NOTHING;
