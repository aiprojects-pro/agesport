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

  // Centroides aproximados de las provincias españolas + zoom por defecto
  // para hacer pan directo al filtrar por provincia. No pretenden precisión
  // catastral: sirven para que el visor "aterrice" en la zona correcta.
  const PROV_CENTROIDS = {
    // Andalucía
    'Almería':[36.844,-2.467,9],'Cádiz':[36.527,-6.288,9],'Córdoba':[37.883,-4.779,9],
    'Granada':[37.176,-3.599,9],'Huelva':[37.261,-6.944,9],'Jaén':[37.766,-3.789,9],
    'Málaga':[36.720,-4.421,9],'Sevilla':[37.389,-5.984,9],
    // Aragón / Asturias / Baleares / Canarias / Cantabria
    'Huesca':[42.140,-0.409,8],'Teruel':[40.344,-1.108,8],'Zaragoza':[41.657,-0.877,8],
    'Asturias':[43.362,-5.851,8],'Illes Balears':[39.570,2.646,8],
    'Las Palmas':[28.124,-15.436,9],'Santa Cruz de Tenerife':[28.469,-16.254,9],
    'Cantabria':[43.182,-3.987,9],
    // Castilla-La Mancha / Castilla y León / Cataluña
    'Albacete':[38.995,-1.858,8],'Ciudad Real':[38.986,-3.927,8],'Cuenca':[40.070,-2.134,8],
    'Guadalajara':[40.633,-3.166,8],'Toledo':[39.862,-4.023,8],
    'Ávila':[40.657,-4.700,8],'Burgos':[42.343,-3.696,8],'León':[42.598,-5.567,8],
    'Palencia':[42.008,-4.532,8],'Salamanca':[40.966,-5.663,8],'Segovia':[40.947,-4.117,8],
    'Soria':[41.763,-2.464,8],'Valladolid':[41.652,-4.724,8],'Zamora':[41.503,-5.744,8],
    'Barcelona':[41.383,2.183,9],'Girona':[41.983,2.824,9],'Lleida':[41.617,0.620,8],
    'Tarragona':[41.117,1.244,9],
    // Extremadura / Galicia / La Rioja / Madrid / Murcia / Navarra / País Vasco / C.Valenciana
    'Badajoz':[38.879,-6.970,8],'Cáceres':[39.476,-6.371,8],
    'A Coruña':[43.362,-8.410,8],'Lugo':[43.010,-7.556,8],
    'Ourense':[42.336,-7.864,8],'Pontevedra':[42.431,-8.645,8],
    'La Rioja':[42.463,-2.446,9],'Madrid':[40.416,-3.703,9],'Murcia':[37.984,-1.128,9],
    'Navarra':[42.816,-1.646,9],
    'Álava':[42.847,-2.673,9],'Gipuzkoa':[43.171,-2.169,9],'Bizkaia':[43.263,-2.935,9],
    'Alicante':[38.345,-0.481,9],'Castellón':[39.987,-0.037,9],'Valencia':[39.470,-0.376,9],
    'Ceuta':[35.889,-5.325,11],'Melilla':[35.294,-2.938,11]
  };

  // Render leyenda de roles (con sus colores)
  rolLegend.innerHTML = cat.ROLES_CLUSTER.map(function (r) {
    return '<span class="leg-item" style="--leg-color:' + r.color + '">' + escapeHtml(r.label) + '</span>';
  }).join('');

  let currentScope = 'andalucia';
  let currentLabelMode = 'nombre'; // 'nombre' | 'rol'
  let currentRolFilter = '';
  let currentEspFilter = '';
  let currentProvFilter = '';
  let observatorio = null;
  let mapaLeaflet = null;
  let markersLayer = null;
  let sociosMapa = [];

  // ==== Poblar los dropdowns de filtro (rol + especialidad + provincia) ====
  const filtroRol = $('filtroRol');
  const filtroEspecialidad = $('filtroEspecialidad');
  const filtroProvincia = $('filtroProvincia');
  const filtroReset = $('filtroReset');
  if (filtroRol) {
    cat.ROLES_CLUSTER.forEach(function (r) {
      const opt = document.createElement('option');
      opt.value = r.slug; opt.textContent = r.label;
      filtroRol.appendChild(opt);
    });
  }
  if (filtroEspecialidad && cat.ESPECIALIDADES) {
    cat.ESPECIALIDADES.forEach(function (e) {
      const opt = document.createElement('option');
      opt.value = e.slug; opt.textContent = e.label;
      filtroEspecialidad.appendChild(opt);
    });
  }
  if (filtroProvincia && cat.COMUNIDADES_AUTONOMAS) {
    // Todas las provincias del catálogo, ordenadas alfabéticamente
    const provincias = cat.COMUNIDADES_AUTONOMAS
      .flatMap(function (ca) { return ca.provincias; })
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
    provincias.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      filtroProvincia.appendChild(opt);
    });
  }

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

  // Aplica los filtros activos (territorial + provincia + rol + especialidad) a un socio.
  function matchesFilters(s) {
    if (!inScope(s.provincia)) return false;
    if (currentProvFilter && s.provincia !== currentProvFilter) return false;
    if (currentRolFilter && s.rol_cluster !== currentRolFilter) return false;
    if (currentEspFilter) {
      const esp = Array.isArray(s.especialidades) ? s.especialidades : [];
      if (esp.indexOf(currentEspFilter) === -1) return false;
    }
    return true;
  }

  function renderMarkers() {
    if (!markersLayer) return;
    markersLayer.clearLayers();
    const visibles = sociosMapa.filter(matchesFilters);
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
    // Encaja viewport. Si hay filtro de provincia activo, dominamos con
    // el centroide de la provincia (aunque no haya marcadores ahí, el
    // visor "aterriza" en la provincia seleccionada). Sino, ajustamos
    // al ámbito territorial o a los marcadores visibles.
    const bboxByScope = {
      andalucia: BBOX_ANDALUCIA,
      oriental: BBOX_ORIENTAL,
      occidental: BBOX_OCCIDENTAL,
      espana: BBOX_ESPANA,
    };
    if (currentProvFilter && PROV_CENTROIDS[currentProvFilter]) {
      const c = PROV_CENTROIDS[currentProvFilter];
      mapaLeaflet.setView([c[0], c[1]], c[2], { animate: false });
    } else if (visibles.length > 0) {
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
    renderCharts();
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

  // Filtros de rol y especialidad — recalculan mapa + KPIs al vuelo.
  function applyFilters() {
    renderMarkers();
    renderKPIs();
    renderKpiDetail();
    renderCharts();
  }
  if (filtroRol) filtroRol.addEventListener('change', function () {
    currentRolFilter = filtroRol.value || '';
    applyFilters();
  });
  if (filtroEspecialidad) filtroEspecialidad.addEventListener('change', function () {
    currentEspFilter = filtroEspecialidad.value || '';
    applyFilters();
  });
  if (filtroProvincia) filtroProvincia.addEventListener('change', function () {
    currentProvFilter = filtroProvincia.value || '';
    applyFilters();
    // Pan directo al centroide de la provincia seleccionada. Si hay
    // marcadores en la provincia, renderMarkers() los encaja después,
    // pero si no hay ninguno el visor se queda ubicado en la provincia
    // igualmente (por eso el pan explícito).
    if (mapaLeaflet && currentProvFilter && PROV_CENTROIDS[currentProvFilter]) {
      const c = PROV_CENTROIDS[currentProvFilter];
      mapaLeaflet.setView([c[0], c[1]], c[2], { animate: true });
    }
  });
  if (filtroReset) filtroReset.addEventListener('click', function () {
    currentRolFilter = ''; currentEspFilter = ''; currentProvFilter = '';
    if (filtroRol) filtroRol.value = '';
    if (filtroEspecialidad) filtroEspecialidad.value = '';
    if (filtroProvincia) filtroProvincia.value = '';
    applyFilters();
  });

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
    // Aplicar también los filtros de rol/especialidad al listado de KPIs
    const inScopeSocios = sociosMapa.filter(matchesFilters);
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
    // Aplicar también los filtros de rol/especialidad al listado de KPIs
    const inScopeSocios = sociosMapa.filter(matchesFilters);
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
    renderCharts();
    renderObservatorio();
    renderMensajeria(msgRes.estadisticas || {});
  }).catch(function () {});

  // ===================================================================
  // ==================== INDICADORES AGREGADOS =========================
  // ===================================================================
  // 6 gráficos de barras horizontales sobre los socios visibles (respetan
  // el ámbito territorial y filtros activos). Solo datos agregados: nunca
  // se identifica a un socio individual en esta sección.

  function bar(label, count, total, colorClass) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return '<div class="bar-row">' +
      '<span class="bar-label">' + escapeHtml(label) + '</span>' +
      '<span class="bar-track"><span class="bar-fill ' + (colorClass || '') + '" style="width:' + pct + '%"></span></span>' +
      '<span class="bar-count">' + count + '</span>' +
    '</div>';
  }

  function chartCard(title, body, note) {
    return '<div class="chart-card"><h4>' + escapeHtml(title) + '</h4>' +
      (body || '<div class="chart-empty">Sin datos en este ámbito.</div>') +
      (note ? '<div class="chart-note">' + escapeHtml(note) + '</div>' : '') +
    '</div>';
  }

  function groupBy(arr, keyFn) {
    const out = {};
    arr.forEach(function (x) {
      const k = keyFn(x);
      if (k == null) return;
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  function chartSexo(socios) {
    const g = groupBy(socios, function (s) { return s.sexo; });
    const total = socios.length;
    const conDato = (g.femenino || 0) + (g.masculino || 0);
    const sinDato = total - conDato;
    let body = '';
    body += bar('Femenino', g.femenino || 0, total, 'color-pink');
    body += bar('Masculino', g.masculino || 0, total, 'color-blue');
    if (sinDato > 0) body += bar('Sin declarar', sinDato, total, 'color-gray');
    const note = conDato > 0
      ? Math.round((g.femenino || 0) * 100 / conDato) + '% mujeres · ' +
        Math.round((g.masculino || 0) * 100 / conDato) + '% hombres (sobre socios con dato)'
      : '';
    return chartCard('Distribución por sexo', body, note);
  }

  function chartDelegacion(socios) {
    const total = socios.length;
    if (total === 0) return chartCard('Delegación provincial', null);
    let body = '';
    PROV_ANDALUCIA.forEach(function (p) {
      const n = socios.filter(function (s) { return s.provincia === p; }).length;
      body += bar(p, n, total);
    });
    const fueraAnd = socios.filter(function (s) { return PROV_ANDALUCIA.indexOf(s.provincia) === -1; }).length;
    if (fueraAnd > 0) body += bar('Otras (fuera Andalucía)', fueraAnd, total, 'color-gray');
    return chartCard('Delegación provincial (Andalucía)', body);
  }

  function chartTipoSocio(socios) {
    const g = groupBy(socios, function (s) { return s.tipo_socio; });
    const total = socios.length;
    const labels = {
      numero: 'Socio/a de número',
      asociado_corporativo: 'Asociado corporativo',
      fundador: 'Fundador/a',
      honor: 'De honor',
      colaborador: 'Colaborador/a',
    };
    let body = '';
    Object.keys(labels).forEach(function (k) {
      if (g[k]) body += bar(labels[k], g[k], total);
    });
    return chartCard('Tipo de socio/a', body || null);
  }

  function chartAmbito(socios) {
    const g = groupBy(socios, function (s) { return s.ambito; });
    const total = socios.length;
    let body = '';
    ['Público','Privado','Mixto / Otros'].forEach(function (a) {
      if (g[a]) body += bar(a, g[a], total);
    });
    return chartCard('Ámbito profesional', body || null);
  }

  function chartExperiencia(socios) {
    const total = socios.length;
    if (total === 0) return chartCard('Rango de experiencia', null);
    let junior = 0, medior = 0, senior = 0, sin = 0;
    socios.forEach(function (s) {
      const y = parseInt(s.anos_experiencia);
      if (!y && y !== 0) { sin++; return; }
      if (y < 5) junior++;
      else if (y < 15) medior++;
      else senior++;
    });
    let body = '';
    body += bar('Junior (0-4 años)', junior, total);
    body += bar('Medior (5-14 años)', medior, total);
    body += bar('Senior (15+ años)', senior, total);
    if (sin > 0) body += bar('Sin declarar', sin, total, 'color-gray');
    return chartCard('Rango de experiencia', body);
  }

  function chartActividad(socios) {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const total = socios.length;
    if (total === 0) return chartCard('Actividad reciente', null);
    const altas30 = socios.filter(function (s) { return s.fecha_registro && (now - new Date(s.fecha_registro).getTime()) < 30 * DAY; }).length;
    const altas90 = socios.filter(function (s) { return s.fecha_registro && (now - new Date(s.fecha_registro).getTime()) < 90 * DAY; }).length;
    const activos30 = socios.filter(function (s) { return s.ultimo_acceso && (now - new Date(s.ultimo_acceso).getTime()) < 30 * DAY; }).length;
    let body = '';
    body += bar('Altas últimos 30 días', altas30, total);
    body += bar('Altas últimos 90 días', altas90, total);
    body += bar('Activos (login < 30d)', activos30, total);
    return chartCard('Actividad reciente', body);
  }

  function renderCharts() {
    const grid = $('chartsGrid');
    if (!grid) return;
    const visibles = sociosMapa.filter(matchesFilters);
    grid.innerHTML =
      chartSexo(visibles) +
      chartDelegacion(visibles) +
      chartTipoSocio(visibles) +
      chartAmbito(visibles) +
      chartExperiencia(visibles) +
      chartActividad(visibles);
  }
})();
