(function () {
  const { requireSession, request, logout, escapeHtml } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;
  const $ = (id) => document.getElementById(id);

  const welcomeTitle = $('welcomeTitle');
  const welcomeText = $('welcomeText');
  const kpis = $('kpis');
  const observatorioSummary = $('observatorioSummary');
  const mensajeriaSummary = $('mensajeriaSummary');
  const territoryFilter = $('territoryFilter');
  const mapContainer = $('mapContainer');
  const rolLegend = $('rolLegend');
  $('logoutBtn').addEventListener('click', logout);

  const PROV_ORIENTAL = ['Almería', 'Granada', 'Jaén', 'Málaga'];
  const PROV_OCCIDENTAL = ['Cádiz', 'Córdoba', 'Huelva', 'Sevilla'];
  const PROV_ANDALUCIA = PROV_ORIENTAL.concat(PROV_OCCIDENTAL);

  // Bboxes aproximados por vista (para que el zoom encaje bien cuando
  // el usuario cambia el ámbito antes de que carguen los marcadores).
  const BBOX_ANDALUCIA = [[35.9, -7.6], [38.9, -1.7]];
  const BBOX_ORIENTAL  = [[36.6, -4.7], [38.9, -1.7]];
  const BBOX_OCCIDENTAL= [[36.0, -7.6], [38.2, -4.3]];
  const BBOX_ESPANA    = [[35.8, -9.5], [43.9, 4.5]];

  // Render leyenda de roles (con sus colores)
  rolLegend.innerHTML = cat.ROLES_CLUSTER.map(function (r) {
    return '<span class="leg-item" style="--leg-color:' + r.color + '">' + escapeHtml(r.label) + '</span>';
  }).join('');

  let currentScope = 'andalucia';
  let currentLabelMode = 'nombre'; // 'nombre' | 'rol'
  let observatorio = null;
  let mapaLeaflet = null;
  let markersLayer = null;
  let sociosMapa = [];

  function rolColor(slug) {
    const r = cat.ROLES_CLUSTER.find(function (x) { return x.slug === slug; });
    return r ? r.color : '#37474F';
  }

  // Mapa Leaflet real (Google-Maps-like) con marcadores individuales
  // por socio. Datos desde /api/socios/mapa (sólo socios autenticados
  // ven la identidad; el mapa público es aparte y anónimo).
  async function loadMap() {
    if (!mapContainer || typeof L === 'undefined') {
      if (mapContainer) mapContainer.innerHTML = '<p class="empty">Leaflet no disponible.</p>';
      return;
    }
    if (!mapaLeaflet) {
      mapaLeaflet = L.map(mapContainer, {
        scrollWheelZoom: false,
        zoomControl: true,
      }).fitBounds(BBOX_ANDALUCIA);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '© OpenStreetMap',
      }).addTo(mapaLeaflet);
      markersLayer = L.layerGroup().addTo(mapaLeaflet);
    }
    try {
      const data = await request('/api/socios/mapa', { method: 'GET', headers: {} });
      sociosMapa = (data.socios || []).filter(function (s) {
        return typeof s.lat === 'number' && typeof s.lng === 'number';
      });
      renderMarkers();
    } catch (err) {
      console.warn('Error cargando mapa socios:', err);
      mapContainer.innerHTML = '<p class="empty">No se ha podido cargar el mapa.</p>';
    }
  }

  function inScope(prov) {
    if (currentScope === 'andalucia') return PROV_ANDALUCIA.indexOf(prov) !== -1;
    if (currentScope === 'oriental')  return PROV_ORIENTAL.indexOf(prov) !== -1;
    if (currentScope === 'occidental')return PROV_OCCIDENTAL.indexOf(prov) !== -1;
    return true; // 'espana' → todos
  }

  function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    const visibles = sociosMapa.filter(function (s) { return inScope(s.provincia); });
    visibles.forEach(function (s) {
      const color = rolColor(s.rol_cluster);
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 11,
        fillColor: color,
        color: '#fff',
        weight: 2.5,
        opacity: 1,
        fillOpacity: 0.95,
      });
      const nombreCorto = ((s.nombre || '') + ' ' + ((s.apellidos || '').split(' ')[0] || '')).trim();
      const rolLabelText = (function () {
        const r = cat.ROLES_CLUSTER.find(function (x) { return x.slug === s.rol_cluster; });
        return r ? r.label : '';
      })();
      const label = currentLabelMode === 'rol'
        ? (rolLabelText || '—')
        : (nombreCorto || s.localidad || '—');
      marker.bindTooltip(label, {
        permanent: true,
        direction: 'right',
        offset: [12, 0],
        className: 'socio-tooltip',
      });
      const rolLabel = (function () {
        const r = cat.ROLES_CLUSTER.find(function (x) { return x.slug === s.rol_cluster; });
        return r ? r.label : '';
      })();
      const nombreCompleto = escapeHtml((s.nombre || '') + ' ' + (s.apellidos || '')).trim();
      marker.bindPopup(
        '<div class="socio-popup">' +
          '<strong>' + (nombreCompleto || '(sin nombre)') + '</strong>' +
          (s.entidad ? '<div>' + escapeHtml(s.entidad) + '</div>' : '') +
          (rolLabel ? '<div class="muted" style="color:' + color + '">' + escapeHtml(rolLabel) + '</div>' : '') +
          '<div class="muted">' + escapeHtml((s.localidad || '') + (s.provincia ? ', ' + s.provincia : '')) + '</div>' +
          '<div class="socio-popup-actions">' +
            '<a class="btn btn-primary btn-sm" href="/mensajes.html?receptor=' + encodeURIComponent(s.id) + '">Enviar mensaje</a>' +
            '<a class="btn btn-secondary btn-sm" href="/perfil.html?socioId=' + encodeURIComponent(s.id) + '">Ver perfil</a>' +
          '</div>' +
        '</div>'
      );
      markersLayer.addLayer(marker);
    });
    // Encaja viewport al ámbito, con fallback a marcadores visibles
    const bboxByScope = {
      andalucia: BBOX_ANDALUCIA,
      oriental: BBOX_ORIENTAL,
      occidental: BBOX_OCCIDENTAL,
      espana: BBOX_ESPANA,
    };
    if (visibles.length > 0) {
      const group = L.featureGroup(markersLayer.getLayers());
      const gb = group.getBounds();
      if (gb.isValid()) mapaLeaflet.fitBounds(gb, { padding: [30, 30], maxZoom: 10 });
      else mapaLeaflet.fitBounds(bboxByScope[currentScope] || BBOX_ESPANA);
    } else {
      mapaLeaflet.fitBounds(bboxByScope[currentScope] || BBOX_ESPANA);
    }
    // Leaflet a veces necesita invalidateSize si el contenedor cambió
    setTimeout(function () { mapaLeaflet.invalidateSize(); }, 60);
  }

  function applyScopeHighlight() { renderMarkers(); }

  // Filtro territorial segmentado
  territoryFilter.addEventListener('click', function (ev) {
    const btn = ev.target.closest('button');
    if (!btn) return;
    Array.from(territoryFilter.querySelectorAll('button')).forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentScope = btn.dataset.scope;
    applyScopeHighlight();
    renderKPIs();
    renderKpiDetail();
  });

  // Toggle etiqueta del marcador: nombre vs rol
  const labelMode = $('labelMode');
  if (labelMode) {
    labelMode.addEventListener('click', function (ev) {
      const btn = ev.target.closest('button');
      if (!btn) return;
      Array.from(labelMode.querySelectorAll('button')).forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      currentLabelMode = btn.dataset.label;
      renderMarkers();
    });
  }

  function filterByScope(kpiData) {
    if (!observatorio) return kpiData;
    const charts = observatorio.charts || {};
    const distProv = charts.distribucion_provincias || [];

    if (currentScope === 'andalucia') {
      return {
        socios: kpiData.total_socios || 0,
        provincias: kpiData.provincias_activas || 0,
        scopeLabel: 'Andalucía'
      };
    }
    if (currentScope === 'espana') {
      return {
        socios: kpiData.total_socios || 0,
        provincias: kpiData.provincias_activas || 0,
        scopeLabel: 'España'
      };
    }
    const provincias = currentScope === 'oriental' ? PROV_ORIENTAL : PROV_OCCIDENTAL;
    const total = distProv.filter(function (d) { return provincias.indexOf(d.provincia) !== -1; })
                          .reduce(function (a, b) { return a + parseInt(b.total || 0, 10); }, 0);
    return {
      socios: total,
      provincias: provincias.length,
      scopeLabel: currentScope === 'oriental' ? 'Andalucía oriental' : 'Andalucía occidental'
    };
  }

  function renderKPIs() {
    if (!observatorio) return;
    const scoped = filterByScope(observatorio.kpis || {});
    const inScopeSocios = sociosMapa.filter(function (s) { return inScope(s.provincia); });
    const mentoresInScope = inScopeSocios.filter(function (s) { return s.disponibilidad === 'Alta' || s.tutor_mentor; });
    const b2bInScope = inScopeSocios.filter(function (s) { return s.b2b_ofrece || s.b2b_busca || s.b2b_licita; });

    const items = [
      { key: 'socios',    label: 'Socios registrados',    value: inScopeSocios.length, desc: 'Perfiles visibles en ' + scoped.scopeLabel, highlight: true },
      { key: 'provincias',label: 'Provincias activas',    value: new Set(inScopeSocios.map(function(s){return s.provincia;})).size, desc: 'Cobertura territorial actual' },
      { key: 'mentores',  label: 'Mentores disponibles',  value: mentoresInScope.length, desc: 'Disponibilidad alta o rol de mentor' },
      { key: 'b2b',       label: 'Proyectos B2B activos', value: b2bInScope.length, desc: 'Socios con interés B2B activo' }
    ];

    kpis.innerHTML = items.map(function (it) {
      return '<article class="metric ' + (it.highlight ? 'highlight' : '') + '" data-kpi="' + it.key + '" role="button" tabindex="0">' +
        '<small>' + it.label + '</small>' +
        '<strong>' + escapeHtml(it.value) + '</strong>' +
        '<span>' + it.desc + '</span>' +
      '</article>';
    }).join('');
  }

  // ==== Panel de detalle por KPI ====
  const kpiDetail = $('kpiDetail');
  let selectedKpi = null;

  function socioItem(s) {
    const rolLabel = (function () {
      const r = cat.ROLES_CLUSTER.find(function (x) { return x.slug === s.rol_cluster; });
      return r ? r.label : '—';
    })();
    return '<div class="kpi-item">' +
      '<span class="name">' + escapeHtml(((s.nombre || '') + ' ' + (s.apellidos || '')).trim() || '(sin nombre)') + '</span>' +
      '<span class="meta">' + escapeHtml(s.entidad || '—') + ' · ' + escapeHtml(rolLabel) + '</span>' +
      '<span class="meta">' + escapeHtml((s.localidad || '') + (s.provincia ? ', ' + s.provincia : '')) + '</span>' +
      '<a href="/perfil.html?socioId=' + encodeURIComponent(s.id) + '">Ver perfil</a>' +
    '</div>';
  }

  function renderKpiDetail() {
    if (!selectedKpi) { kpiDetail.hidden = true; kpiDetail.innerHTML = ''; return; }
    const scoped = filterByScope(observatorio ? (observatorio.kpis || {}) : {});
    const inScopeSocios = sociosMapa.filter(function (s) { return inScope(s.provincia); });
    const headings = {
      socios:     'Socios registrados en ' + scoped.scopeLabel,
      provincias: 'Provincias activas en ' + scoped.scopeLabel,
      mentores:   'Mentores disponibles en ' + scoped.scopeLabel,
      b2b:        'Socios con interés B2B en ' + scoped.scopeLabel
    };
    let body;
    if (selectedKpi === 'provincias') {
      const byProv = {};
      inScopeSocios.forEach(function (s) {
        if (!s.provincia) return;
        if (!byProv[s.provincia]) byProv[s.provincia] = [];
        byProv[s.provincia].push(s);
      });
      const provs = Object.keys(byProv).sort();
      body = provs.length ? '<div class="kpi-list">' + provs.map(function (p) {
        return '<div class="kpi-item"><span class="name">' + escapeHtml(p) + '</span>' +
          '<span class="meta">' + byProv[p].length + ' socio(s)</span>' +
          byProv[p].map(function (s) {
            return '<span class="meta">· ' + escapeHtml(((s.nombre||'')+' '+(s.apellidos||'')).trim()) + '</span>';
          }).join('') + '</div>';
      }).join('') + '</div>' : '<p class="kpi-empty">Sin provincias activas en este ámbito.</p>';
    } else {
      let filtered;
      if (selectedKpi === 'mentores') {
        filtered = inScopeSocios.filter(function (s) { return s.disponibilidad === 'Alta' || s.tutor_mentor; });
      } else if (selectedKpi === 'b2b') {
        filtered = inScopeSocios.filter(function (s) { return s.b2b_ofrece || s.b2b_busca || s.b2b_licita; });
      } else {
        filtered = inScopeSocios;
      }
      body = filtered.length
        ? '<div class="kpi-list">' + filtered.map(socioItem).join('') + '</div>'
        : '<p class="kpi-empty">Sin resultados en este ámbito.</p>';
    }
    kpiDetail.hidden = false;
    kpiDetail.innerHTML =
      '<div class="kpi-detail-head">' +
        '<h3>' + escapeHtml(headings[selectedKpi] || '') + '</h3>' +
        '<button type="button" class="close" aria-label="Cerrar" data-kpi-close>×</button>' +
      '</div>' + body;
    Array.from(kpis.children).forEach(function (c) {
      c.classList.toggle('selected', c.dataset.kpi === selectedKpi);
    });
  }

  kpis.addEventListener('click', function (ev) {
    const card = ev.target.closest('[data-kpi]');
    if (!card) return;
    const key = card.dataset.kpi;
    selectedKpi = (selectedKpi === key) ? null : key;
    renderKpiDetail();
  });
  kpiDetail.addEventListener('click', function (ev) {
    if (ev.target.matches('[data-kpi-close]')) { selectedKpi = null; renderKpiDetail(); }
  });

  function renderObservatorio() {
    if (!observatorio) return;
    const top3 = (observatorio.charts.top_especialidades || []).slice(0, 3).map(function (row) {
      const esp = cat.findEspecialidadBySlug(row.especialidad);
      return esp ? esp.label : row.especialidad;
    });
    observatorioSummary.innerHTML = [
      '<p><strong>Proyectos B2B:</strong> ' + escapeHtml(observatorio.kpis.proyectos_b2b || 0) + '</p>',
      '<p><strong>Top especialidades:</strong> ' + (top3.length ? top3.map(escapeHtml).join(', ') : 'Sin datos') + '</p>'
    ].join('');
  }

  function renderMensajeria(stats) {
    mensajeriaSummary.innerHTML = [
      '<p><strong>Conversaciones:</strong> ' + escapeHtml(stats.total_conversaciones || 0) + '</p>',
      '<p><strong>Mensajes este mes:</strong> ' + escapeHtml(stats.mensajes_este_mes || 0) + '</p>',
      '<p><strong>No leídos:</strong> ' + escapeHtml(stats.mensajes_no_leidos || 0) + '</p>'
    ].join('');
  }

  requireSession('socio').then(async function (session) {
    welcomeTitle.textContent = 'Bienvenida, ' + session.user.nombre;
    welcomeText.textContent = 'Consulta tus indicadores de actividad, explora el directorio profesional y accede a las herramientas de relación del entorno privado.';

    await loadMap();

    const [obsRes, msgRes] = await Promise.all([
      request('/api/socios/observatorio/stats', { method: 'GET', headers: {} }),
      request('/api/mensajeria/estadisticas', { method: 'GET', headers: {} })
    ]);

    observatorio = obsRes;
    renderKPIs();
    renderObservatorio();
    renderMensajeria(msgRes.estadisticas || {});
  }).catch(function () {});
})();
