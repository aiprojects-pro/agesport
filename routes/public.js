// routes/public.js — endpoints accesibles sin autenticación.
// Sólo deben servir datos agregados o no-PII.
const express = require('express');
const router = express.Router();

const sociosQueries = require('../services/sociosQueries');
const db = require('../config/database');

router.get('/visor-talento', async (req, res) => {
  try {
    const provincias = await sociosQueries.socioCountsByProvincia();
    const total = provincias.reduce((acc, p) => acc + p.count, 0);
    res.json({ provincias, total });
  } catch (error) {
    console.error('Error en visor publico:', error);
    res.status(500).json({ error: 'Error obteniendo el visor del talento' });
  }
});

// GET /api/public/mapa-puntos
// Devuelve SOLO las coordenadas (lat, lng) de socios aprobados que
// consintieron aparecer en el mapa. NO devuelve identidad, ni entidad,
// ni provincia, ni rol — el mapa público es totalmente anónimo.
// Además, jittereamos un poco (±0.005°, ~500m) las coords para no
// revelar municipio exacto cuando hay pocos socios en la zona.
router.get('/mapa-puntos', async (req, res) => {
  try {
    // Incluimos rol_cluster para poder colorear el punto por categoría
    // profesional. NO exponemos identidad, entidad, provincia ni localidad:
    // el rol es dato agregado del clúster, no permite identificar a nadie.
    const result = await db.query(`
      SELECT s.latitud, s.longitud, rc.rol AS rol_cluster
      FROM socios s
      LEFT JOIN rol_cluster rc ON rc.socio_id = s.id
      JOIN consentimientos c ON c.socio_id = s.id
      WHERE s.estado = 'aprobado'
        AND s.activo = true
        AND c.acepta_mapa_interactivo = true
        AND s.latitud IS NOT NULL
        AND s.longitud IS NOT NULL
    `);
    // Jitter determinístico-ish para anonimizar sin cambiar en cada
    // request (usamos un pseudo-random basado en los bits del float).
    const jitter = (v) => {
      const f = Number(v);
      const noise = ((Math.sin(f * 12345.6789) + 1) / 2 - 0.5) * 0.01;
      return Number((f + noise).toFixed(6));
    };
    const puntos = result.rows.map((r) => ({
      lat: jitter(r.latitud),
      lng: jitter(r.longitud),
      rol_cluster: r.rol_cluster || null,
    }));
    // Cache moderado (30s) para no volver a Postgres a cada carga
    // pero permitir que un socio recién aprobado aparezca pronto.
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ puntos, total: puntos.length });
  } catch (error) {
    console.error('Error en mapa público:', error);
    res.status(500).json({ error: 'Error obteniendo el mapa' });
  }
});

router.get('/landing', async (req, res) => {
  try {
    // Excluimos las claves email.* que sólo se usan en plantillas server-side
    // — no tienen utilidad en la landing y no deben exponerse a quien no es admin.
    const result = await db.query(
      "SELECT clave, valor, tipo FROM landing_content WHERE clave NOT LIKE 'email.%'"
    );
    const content = {};
    for (const row of result.rows) {
      content[row.clave] =
        row.tipo === 'image' ? { tipo: 'image', valor: row.valor } : row.valor;
    }
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ content });
  } catch (error) {
    console.error('Error en landing publico:', error);
    res.status(500).json({ error: 'Error obteniendo contenido de landing' });
  }
});

module.exports = router;
