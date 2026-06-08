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
