-- Migration 012: plantilla editable del email de bienvenida.
--
-- Las claves email.welcome.* viven en landing_content y se exponen
-- en el editor admin (Landing pública). emailService.notifySocioApproved
-- las lee con fallback a defaults si la BD no tiene la clave.
--
-- El placeholder {nombre} se reemplaza por el nombre del socio.
--
-- Idempotente (ON CONFLICT DO NOTHING).

INSERT INTO landing_content (clave, valor) VALUES
  ('email.welcome.subject',     '¡Bienvenido al Mapa del Talento de AGESPORT!'),
  ('email.welcome.heading',     '¡Tu cuenta ha sido aprobada!'),
  ('email.welcome.greeting',    'Hola {nombre},'),
  ('email.welcome.intro',       '¡Excelentes noticias! Tu registro en el Mapa del Talento de AGESPORT ha sido aprobado por nuestra Gerencia.'),
  ('email.welcome.list_intro',  'Ya puedes acceder a la plataforma y:'),
  ('email.welcome.list_items',  'Explorar el directorio de socios|Contactar con otros profesionales del sector|Participar en el ecosistema B2B del clúster|Actualizar tu perfil cuando necesites'),
  ('email.welcome.cta',         'Acceder a la Plataforma'),
  ('email.welcome.outro',       'Si tienes cualquier duda, no dudes en contactar con nosotros.'),
  ('email.welcome.signature',   '¡Bienvenido/a a la comunidad!')
ON CONFLICT (clave) DO NOTHING;
