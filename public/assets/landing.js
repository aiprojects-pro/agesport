// public/assets/landing.js
// Aplica el contenido editado por admin (data-cms) y pinta el visor
// público del talento: contador de socios, reparto por perfil y mapa de
// provincias. Todo son datos agregados (/api/public/visor-talento), sin PII.

(function () {
  'use strict';

  const cat = window.AgesportCatalogos || { ROLES_CLUSTER: [] };
  const OTHER_COLOR = '#9aa8b4';

  function rolColor(slug) {
    const r = (cat.ROLES_CLUSTER || []).find(function (x) { return x.slug === slug; });
    return r ? r.color : OTHER_COLOR;
  }
  function rolLabel(slug) {
    const r = (cat.ROLES_CLUSTER || []).find(function (x) { return x.slug === slug; });
    return r ? r.label : 'Otros perfiles';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  const fmt = new Intl.NumberFormat('es-ES');

  // ====== CMS: aplica los textos / imágenes editados al DOM ======
  function applyCms(content) {
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      const entry = content[el.getAttribute('data-cms')];
      if (entry === undefined) return;
      el.textContent = typeof entry === 'string' ? entry : entry.valor;
    });
    document.querySelectorAll('[data-cms-img]').forEach(function (el) {
      const entry = content[el.getAttribute('data-cms-img')];
      if (entry === undefined) return;
      const url = typeof entry === 'string' ? entry : entry.valor;
      if (url) el.setAttribute('src', url);
    });
    // Listas separadas por "|" (fichas de tipo de socio)
    document.querySelectorAll('[data-list]').forEach(function (ul) {
      const entry = content[ul.getAttribute('data-list')];
      const text = entry === undefined ? '' : (typeof entry === 'string' ? entry : entry.valor);
      const items = String(text || '').split(/[|\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
      ul.innerHTML = items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('');
      ul.hidden = !items.length;
    });
  }

  fetch('/api/public/landing')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (data) { applyCms(data.content || {}); })
    .catch(function (err) { console.warn('[landing] CMS no disponible, mostrando texto por defecto:', err); });

  // ====== Contador animado ======
  function animateNumber(el, target) {
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target < 10) { el.textContent = fmt.format(target); return; }
    const start = performance.now();
    const dur = 1100;
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderStats(data) {
    animateNumber(document.getElementById('liveTotal'), data.total || 0);
    animateNumber(document.getElementById('liveProvincias'), data.total_provincias || 0);
    animateNumber(document.getElementById('liveRoles'), (data.roles || []).length);
    const bar = document.getElementById('liveRoleBar');
    const rolesTotal = (data.roles || []).reduce(function (a, r) { return a + r.count; }, 0);
    if (bar && rolesTotal) {
      bar.innerHTML = data.roles.map(function (r) {
        return '<i style="width:' + (r.count / rolesTotal * 100).toFixed(2) + '%;background:' + rolColor(r.rol_cluster) + '" title="' + esc(rolLabel(r.rol_cluster)) + ': ' + r.count + '"></i>';
      }).join('');
    }
    const legend = document.getElementById('roleLegend');
    if (legend) {
      legend.innerHTML = (data.roles || []).map(function (r) {
        return '<span><i style="background:' + rolColor(r.rol_cluster) + '"></i>' + esc(rolLabel(r.rol_cluster)) + '</span>';
      }).join('') + '<span><i style="background:' + OTHER_COLOR + '"></i>Otros / sin rol</span>';
    }
    const rank = document.getElementById('provRank');
    if (rank) {
      const provs = (data.provincias || []).slice().sort(function (a, b) { return b.count - a.count; });
      const max = provs.length ? provs[0].count : 1;
      rank.innerHTML = provs.length ? provs.map(function (p) {
        return '<li><span>' + esc(p.provincia) + '</span><span>' + fmt.format(p.count) + '</span>' +
          '<span class="bar"><i style="width:' + Math.max(4, p.count / max * 100).toFixed(1) + '%"></i></span></li>';
      }).join('') : '<li class="map-empty">Todavía no hay socios publicados.</li>';
    }
  }

  // ====== Mapa público: una burbuja por provincia ======
  // El tamaño refleja el nº de socios y el anillo, el reparto por perfil
  // profesional. Los perfiles con muy pocos socios en una provincia se
  // agrupan en "otros" desde el servidor para no identificar a nadie.
  function renderMap(data) {
    const el = document.getElementById('landing-map');
    if (!el || typeof L === 'undefined') return;
    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true })
      .fitBounds([[35.9, -7.6], [38.8, -1.6]]);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    const provs = (data.provincias || []).filter(function (p) { return p.lat != null && p.lng != null; });
    if (!provs.length) return;
    const max = provs.reduce(function (m, p) { return Math.max(m, p.count); }, 1);
    const group = L.featureGroup();
    provs.forEach(function (p) {
      const parts = (p.roles || []).map(function (r) { return { color: rolColor(r.rol_cluster), label: rolLabel(r.rol_cluster), n: r.count }; });
      if (p.otros) parts.push({ color: OTHER_COLOR, label: 'Otros perfiles', n: p.otros });
      let acc = 0;
      const stops = parts.map(function (x) {
        const from = acc / p.count * 360; acc += x.n;
        return x.color + ' ' + from.toFixed(1) + 'deg ' + (acc / p.count * 360).toFixed(1) + 'deg';
      }).join(', ');
      const size = Math.round(28 + 30 * Math.sqrt(p.count / max));
      const icon = L.divIcon({
        className: 'prov-bubble-icon',
        iconSize: [size, size],
        html: '<div class="prov-bubble" style="width:' + size + 'px;height:' + size + 'px;background:conic-gradient(' + stops + ')"><span>' + fmt.format(p.count) + '</span></div>',
      });
      L.marker([p.lat, p.lng], { icon: icon, keyboard: true, title: p.provincia + ': ' + p.count + ' socios' })
        .bindTooltip('<strong>' + esc(p.provincia) + '</strong> · ' + fmt.format(p.count) + (p.count === 1 ? ' socio' : ' socios') +
          '<ul>' + parts.map(function (x) { return '<li><span class="dot" style="background:' + x.color + '"></span>' + esc(x.label) + ': ' + x.n + '</li>'; }).join('') + '</ul>',
          { direction: 'top', offset: [0, -size / 2], className: 'map-tooltip' })
        .addTo(group);
    });
    group.addTo(map);
    const bounds = group.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.08), { maxZoom: 8 });
  }

  function loadVisor() {
    fetch('/api/public/visor-talento')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (data) { renderStats(data); renderMap(data); })
      .catch(function (err) {
        console.warn('[landing] visor no disponible:', err);
        const rank = document.getElementById('provRank');
        if (rank) rank.innerHTML = '<li class="map-empty">Datos no disponibles en este momento.</li>';
      });
  }

  // Reveal on-scroll: cada elemento .reveal se hace visible al entrar en el
  // viewport. Sin IntersectionObserver se revelan todos de golpe.
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach(function (el) { el.classList.add('revealed'); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    els.forEach(function (el) { io.observe(el); });
  }

  function boot() { loadVisor(); initReveal(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
