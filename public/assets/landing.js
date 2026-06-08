// public/assets/landing.js
// Aplica el contenido editado por admin (data-cms) y pinta el visor
// del talento (pins agregados por provincia, sin PII).

(function () {
  'use strict';

  // ====== CMS: aplica los textos / imágenes editados al DOM ======
  function applyCms(content) {
    // Texto: data-cms="clave"  →  textContent
    document.querySelectorAll('[data-cms]').forEach((el) => {
      const key = el.getAttribute('data-cms');
      const entry = content[key];
      if (entry === undefined) return;
      const text = typeof entry === 'string' ? entry : entry.valor;
      el.textContent = text;
    });
    // Imagen: data-cms-img="clave"  →  src (sólo <img>)
    document.querySelectorAll('[data-cms-img]').forEach((el) => {
      const key = el.getAttribute('data-cms-img');
      const entry = content[key];
      if (entry === undefined) return;
      const url = typeof entry === 'string' ? entry : entry.valor;
      if (url) el.setAttribute('src', url);
    });
  }

  fetch('/api/public/landing')
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((data) => applyCms(data.content || {}))
    .catch((err) => console.warn('[landing] CMS no disponible, mostrando texto por defecto:', err));

  // ====== Mapa: pins agregados por provincia ======
  function initMap() {
    const el = document.getElementById('landing-map');
    if (!el || typeof L === 'undefined') return;

    // Centro de la península, zoom amplio (cubre toda España)
    const map = L.map(el, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([40.0, -3.7], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 11,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    fetch('/api/public/visor-talento')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const provincias = data.provincias || [];
        if (provincias.length === 0) return;

        const group = L.featureGroup();
        provincias.forEach((p) => {
          if (p.lat == null || p.lng == null) return;
          // Radio escala con el conteo (suave, con cap)
          const radius = Math.min(8 + p.count * 2, 28);
          const circle = L.circleMarker([p.lat, p.lng], {
            radius,
            fillColor: '#2D7A4A',
            color: '#1B4F2E',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.7,
          }).bindTooltip(`${p.provincia}: ${p.count} ${p.count === 1 ? 'socio' : 'socios'}`, {
            direction: 'top',
            offset: [0, -radius],
          });
          circle.addTo(group);
        });
        group.addTo(map);

        // Ajustar el viewport a los pins (con un poco de margen)
        const bounds = group.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 7 });
        }
      })
      .catch((err) => console.warn('[landing] visor del talento no disponible:', err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
})();
