-- Migration 009: añadir tipo de contenido a landing_content.
--
-- Hasta ahora todos los valores eran texto. Para soportar imágenes
-- añadimos una columna `tipo` con valores 'text' (default) o 'image'.
-- El frontend distingue por tipo: text → textContent; image → src.
--
-- También sembramos `topbar.logo` como primera entrada de imagen.
-- Para añadir más imágenes editables: INSERT una clave con tipo='image'
-- + añadir el atributo `data-cms-img="<clave>"` al <img> correspondiente
-- en public/index.html.
--
-- Idempotente.

BEGIN;

ALTER TABLE landing_content ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) NOT NULL DEFAULT 'text'
  CHECK (tipo IN ('text', 'image'));

INSERT INTO landing_content (clave, valor, tipo) VALUES
  ('topbar.logo', '/assets/agesport-logo.svg', 'image')
ON CONFLICT (clave) DO NOTHING;

COMMIT;
