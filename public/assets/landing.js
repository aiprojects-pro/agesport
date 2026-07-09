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

  // ====== Mapa público: puntos anónimos coloreados por rol ======
  // A cada socio con consentimiento le corresponde UN punto en el mapa,
  // sin identidad ni ficha (por RGPD la vista pública es totalmente
  // anónima). Los puntos vienen jittereados desde el backend para no
  // revelar municipio exacto en zonas de poca densidad. El COLOR del
  // punto refleja su rol en el clúster deportivo (categoría profesional
  // agregada) — no permite identificar a un socio concreto.
  function rolColor(slug) {
    const cat = window.AgesportCatalogos;
    if (!cat || !cat.ROLES_CLUSTER) return '#2D7A4A';
    const r = cat.ROLES_CLUSTER.find(function (x) { return x.slug === slug; });
    return r ? r.color : '#37474F';
  }

  function initMap() {
    const el = document.getElementById('landing-map');
    if (!el || typeof L === 'undefined') return;

    const map = L.map(el, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([40.0, -3.7], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 14,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    fetch('/api/public/mapa-puntos')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        const puntos = data.puntos || [];
        if (puntos.length === 0) return;

        const group = L.featureGroup();
        puntos.forEach((p) => {
          if (p.lat == null || p.lng == null) return;
          const color = rolColor(p.rol_cluster);
          L.circleMarker([p.lat, p.lng], {
            radius: 7,
            fillColor: color,
            color: '#fff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.9,
          }).addTo(group);
        });
        group.addTo(map);

        // Encaje viewport con margen. maxZoom 8 para no acercar
        // demasiado y evitar sensación de "aquí hay un socio concreto".
        const bounds = group.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
        }
      })
      .catch((err) => console.warn('[landing] mapa público no disponible:', err));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMap);
  } else {
    initMap();
  }
})();
