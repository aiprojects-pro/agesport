-- Migration 005: añade `localidad` a `accesos_invitados`.
--
-- Contexto: `socios.localidad` es NOT NULL desde el schema base. La plantilla
-- CSV de importación no incluía esa columna, así que `aprobarAccesoInvitado`
-- siempre fallaba al insertar el socio con un error de constraint —
-- el flujo de importación masiva nunca se ejecutó hasta el final en
-- producción. La columna se añade en staging para que el admin pueda
-- aportar el valor al importar.
--
-- Idempotente.

ALTER TABLE accesos_invitados ADD COLUMN IF NOT EXISTS localidad VARCHAR(100);
