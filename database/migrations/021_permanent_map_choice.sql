-- Initial map inclusion authorized by administration on 2026-09-25.
-- This is NOT a record of consent given by members. Their previous consents
-- remain intact; the effective map choice is separate and can be withdrawn.
ALTER TABLE consentimientos ADD COLUMN IF NOT EXISTS mapa_visible BOOLEAN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM configuracion WHERE clave='mapa_inclusion_inicial_20260925') THEN
    INSERT INTO consentimientos(socio_id,mapa_visible,acepta_mensajeria,acepta_notificaciones_email,visible_web_profesional,visible_linkedin)
      SELECT id,true,false,false,false,false FROM socios WHERE activo=true AND estado='aprobado'
      ON CONFLICT(socio_id) DO UPDATE SET mapa_visible=true WHERE consentimientos.mapa_visible IS NULL;
    INSERT INTO configuracion(clave,valor,tipo,descripcion)
      VALUES('mapa_inclusion_inicial_20260925','true','boolean','Inclusión inicial administrativa, no consentimiento individual; no repetir');
  END IF;
END $$;
-- Retire the old global override. No API can reactivate it.
UPDATE configuracion SET valor='{"enabled":false,"expiresAt":null}',updated_at=NOW() WHERE clave='mapa_prueba_temporal';
