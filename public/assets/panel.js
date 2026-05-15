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

  // Render leyenda de roles (con sus colores)
  rolLegend.innerHTML = cat.ROLES_CLUSTER.map(function (r) {
    return '<span class="leg-item" style="--leg-color:' + r.color + '">' + escapeHtml(r.label) + '</span>';
  }).join('');

  let currentScope = 'andalucia';
  let observatorio = null;

  // Inserta el SVG del mapa para poder interactuar con sus paths
  async function loadMap() {
    try {
      const res = await fetch('/assets/mapa-andalucia.svg');
      const svgText = await res.text();
      mapContainer.innerHTML = svgText;
      bindMapInteractions();
    } catch (err) {
      mapContainer.innerHTML = '<p class="empty">No se ha podido cargar el mapa.</p>';
    }
  }

  function bindMapInteractions() {
    const provinces = mapContainer.querySelectorAll('.province');
    provinces.forEach(function (p) {
      p.style.cursor = 'pointer';
      p.addEventListener('click', function () {
        const name = p.getAttribute('data-name');
        if (name) window.location.href = '/directorio.html?provincia=' + encodeURIComponent(name);
      });
      p.addEventListener('mouseover', function () { p.setAttribute('stroke-width', '4'); });
      p.addEventListener('mouseout', function () { p.setAttribute('stroke-width', '2'); });
    });
    applyScopeHighlight();
  }

  function applyScopeHighlight() {
    const provinces = mapContainer.querySelectorAll('.province');
    provinces.forEach(function (p) {
      const name = p.getAttribute('data-name');
      let inScope = true;
      if (currentScope === 'oriental') inScope = PROV_ORIENTAL.indexOf(name) !== -1;
      if (currentScope === 'occidental') inScope = PROV_OCCIDENTAL.indexOf(name) !== -1;
      p.style.opacity = inScope ? '1' : '.28';
    });
  }

  // Filtro territorial segmentado
  territoryFilter.addEventListener('click', function (ev) {
    const btn = ev.target.closest('button');
    if (!btn) return;
    Array.from(territoryFilter.querySelectorAll('button')).forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentScope = btn.dataset.scope;
    applyScopeHighlight();
    renderKPIs();
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
    const items = [
      { label: 'Socios registrados', value: scoped.socios, desc: 'Perfiles visibles en ' + scoped.scopeLabel, highlight: true },
      { label: 'Provincias activas', value: scoped.provincias, desc: 'Cobertura territorial actual' },
      { label: 'Mentores disponibles', value: observatorio.kpis.mentores_disponibles || 0, desc: 'Disponibilidad alta en colaboración' },
      { label: 'Proyectos B2B activos', value: observatorio.kpis.proyectos_b2b || 0, desc: 'Socios con interés B2B activo' }
    ];

    kpis.innerHTML = items.map(function (it) {
      return '<article class="metric ' + (it.highlight ? 'highlight' : '') + '">' +
        '<small>' + it.label + '</small>' +
        '<strong>' + escapeHtml(it.value) + '</strong>' +
        '<span>' + it.desc + '</span>' +
      '</article>';
    }).join('');
  }

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
