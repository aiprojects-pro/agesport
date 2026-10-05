ALTER TABLE administradores ADD COLUMN IF NOT EXISTS provincia_delegacion VARCHAR(100);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='administradores_delegate_province_check') THEN
  ALTER TABLE administradores ADD CONSTRAINT administradores_delegate_province_check
   CHECK (rol <> 'delegado_provincial' OR (provincia_delegacion IS NOT NULL AND btrim(provincia_delegacion) <> ''));
 END IF;
END $$;
