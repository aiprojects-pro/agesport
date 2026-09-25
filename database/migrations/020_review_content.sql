-- Correct only the known old copy; preserve custom editorial content.
UPDATE landing_content SET valor=replace(valor,'15 especialidades:','16 especialidades:')
WHERE clave='capacidades.card2.body' AND valor LIKE '15 especialidades:%';
UPDATE landing_content SET valor='Ficha del talento'
WHERE clave='fases.fase1.title' AND lower(trim(valor))='ficha del talentos';
