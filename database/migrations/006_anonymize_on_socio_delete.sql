-- Migration 006: cambiar FKs de mensajes y conversaciones a ON DELETE SET NULL.
--
-- Contexto: `eliminarCuenta` declaraba "anonimizar mensajes para mantener
-- conversaciones" pero las FKs de `mensajes.emisor_id`, `mensajes.receptor_id`,
-- `conversaciones.socio_1_id` y `conversaciones.socio_2_id` eran `ON DELETE
-- CASCADE`, por lo que la cuenta borrada arrastraba todos los mensajes y
-- conversaciones. La declaración de anonimización era mentira.
--
-- Esta migración alinea las FKs con el intento: SET NULL en lugar de CASCADE.
-- Los mensajes sobreviven con `emisor_id IS NULL`; las queries del listado
-- de conversaciones/mensajes se han adaptado para mostrar "[Cuenta eliminada]"
-- en lugar de excluir la fila.
--
-- Las cuatro columnas ya admiten NULL, no hace falta NOT NULL drop.
-- Idempotente: re-ejecutable, no cambia de comportamiento tras la primera.

BEGIN;

ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_emisor_id_fkey;
ALTER TABLE mensajes
  ADD CONSTRAINT mensajes_emisor_id_fkey
  FOREIGN KEY (emisor_id) REFERENCES socios(id) ON DELETE SET NULL;

ALTER TABLE mensajes DROP CONSTRAINT IF EXISTS mensajes_receptor_id_fkey;
ALTER TABLE mensajes
  ADD CONSTRAINT mensajes_receptor_id_fkey
  FOREIGN KEY (receptor_id) REFERENCES socios(id) ON DELETE SET NULL;

ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS conversaciones_socio_1_id_fkey;
ALTER TABLE conversaciones
  ADD CONSTRAINT conversaciones_socio_1_id_fkey
  FOREIGN KEY (socio_1_id) REFERENCES socios(id) ON DELETE SET NULL;

ALTER TABLE conversaciones DROP CONSTRAINT IF EXISTS conversaciones_socio_2_id_fkey;
ALTER TABLE conversaciones
  ADD CONSTRAINT conversaciones_socio_2_id_fkey
  FOREIGN KEY (socio_2_id) REFERENCES socios(id) ON DELETE SET NULL;

COMMIT;
