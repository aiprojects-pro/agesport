(function () {
  const { requireSession, request, logout, escapeHtml } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;
  const $ = id => document.getElementById(id);
  const welcomeTitle=$('welcomeTitle'), welcomeText=$('welcomeText'), kpis=$('kpis');
  const observatorioSummary=$('observatorioSummary'),mensajeriaSummary=$('mensajeriaSummary');
  const adminView=new URLSearchParams(location.search).get('administracion')==='1';
  let sociosMapa=[],mapLoaded=false;
  $('logoutBtn').addEventListener('click',logout);
  const explorer=new window.AgesportTalentMap({adminView,onChange(items){
    sociosMapa=items;mapLoaded=true;
    renderKPIs();renderKpiDetail();renderCharts();renderObservatorio();
  }});
  const matchesFilters=s=>explorer.matches(s);
  const filterByScope=()=>({scopeLabel:explorer.filters.province||'todo el territorio'});
  const loadMap=()=>explorer.refresh();

  function renderKPIs() {
    if (!mapLoaded) return;
    const scoped = filterByScope();
    // Aplicar también los filtros de rol/especialidad al listado de KPIs
    const inScopeSocios = sociosMapa.filter(matchesFilters);
    const mentoresInScope = inScopeSocios.filter(function (s) { return s.tutor_mentor; });
    const b2bInScope = inScopeSocios.filter(function (s) { return s.b2b_ofrece || s.b2b_busca || s.b2b_licita; });

    const items = [
      { key: 'socios',    label: 'Socios encontrados',    value: inScopeSocios.length, desc: 'Perfiles que coinciden con los filtros' + (inScopeSocios.some(s=>s.lat==null)?' · incluye ubicación pendiente':''), highlight: true },
      { key: 'provincias',label: 'Provincias activas',    value: new Set(inScopeSocios.map(s => s.provincia).filter(Boolean)).size, desc: 'Cobertura territorial actual' },
      { key: 'mentores',  label: 'Socios mentores',  value: mentoresInScope.length, desc: 'Han marcado tutoría o mentoría' },
      { key: 'b2b',       label: 'Socios con interés B2B', value: b2bInScope.length, desc: 'Socios con interés B2B activo' }
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
      return [s.rol_cluster,s.rol_secundario].map(function(slug) { const r = cat.ROLES_CLUSTER.find(function(x) { return x.slug === slug; }); return r ? r.label : ''; }).filter(Boolean).join(' / ') || '—';
    })();
    return '<div class="kpi-item">' +
      '<span class="name">' + escapeHtml(((s.nombre || '') + ' ' + (s.apellidos || '')).trim() || '(sin nombre)') + '</span>' +
      '<span class="meta">' + escapeHtml(s.entidad || '—') + ' · ' + escapeHtml(rolLabel) + '</span>' +
      '<span class="meta">' + escapeHtml((s.localidad || '') + (s.provincia ? ', ' + s.provincia : '')) + '</span>' +
      '<span class="meta">' + (s.precision === 'provincia' ? 'Referencia provincial aproximada' : (s.precision==='pendiente'?'Ubicación pendiente':'Ubicación municipal aproximada')) + '</span>' +
      (!adminView && s.perfil_visible ? '<a href="/perfil.html?socioId=' + encodeURIComponent(s.id) + '">Ver perfil</a>' : '') +
    '</div>';
  }

  function renderKpiDetail() {
    if (!selectedKpi) { kpiDetail.hidden = true; kpiDetail.innerHTML = ''; return; }
    const scoped = filterByScope();
    // Aplicar también los filtros de rol/especialidad al listado de KPIs
    const inScopeSocios = sociosMapa.filter(matchesFilters);
    const headings = {
      socios:     'Socios encontrados en ' + scoped.scopeLabel,
      provincias: 'Provincias activas en ' + scoped.scopeLabel,
      mentores:   'Socios mentores en ' + scoped.scopeLabel,
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
        filtered = inScopeSocios.filter(function (s) { return s.tutor_mentor; });
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
    if (!mapLoaded) return;
    const visible=sociosMapa.filter(matchesFilters); const counts={};
    visible.forEach(s => new Set(s.especialidades || []).forEach(e => counts[e]=(counts[e]||0)+1));
    const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    observatorioSummary.innerHTML='<p><strong>Especialidades entre los perfiles del mapa:</strong></p>'+ (top.length ? '<ul>'+top.map(([slug,n])=>'<li>'+escapeHtml(cat.findEspecialidadBySlug(slug)?.label || slug)+' · '+n+'</li>').join('')+'</ul>' : '<p>Sin especialidades declaradas para estos filtros.</p>');
  }

  function renderMensajeria(stats) {
    mensajeriaSummary.innerHTML = [
      '<p><strong>Conversaciones:</strong> ' + escapeHtml(stats.total_conversaciones || 0) + '</p>',
      '<p><strong>Mensajes este mes:</strong> ' + escapeHtml(stats.mensajes_este_mes || 0) + '</p>',
      '<p><strong>No leídos:</strong> ' + escapeHtml(stats.mensajes_no_leidos || 0) + '</p>'
    ].join('');
  }

  requireSession(adminView ? 'admin' : 'socio').then(async function (session) {
    explorer.viewerId=session.user.id;
    welcomeTitle.textContent = adminView ? 'Mapa de gestión' : 'Tu próxima colaboración empieza aquí';
    welcomeText.textContent = adminView ? 'Vista de gestión de las cuentas aprobadas y activas.' : 'Hola, '+session.user.nombre+'. Explora la experiencia de la comunidad AGESPORT y conecta con quienes comparten tus intereses.';
    if (adminView) {
      document.querySelector('.sidebar nav').innerHTML='<a class="nav-link" href="/admin.html">Volver a administración</a>';
      document.querySelector('.hero-block .eyebrow').textContent='Administración';
      $('feedCard').hidden=true;
      mensajeriaSummary.closest('article').hidden=true;
      document.querySelector('section.grid-3').hidden=true;
    }
    if (!adminView) {
      // Primer acceso: fichas de tipo de socio y recordatorio de completar
      // el perfil y decidir la visibilidad. Se muestra una sola vez.
      request('/api/socios/perfil/' + session.user.id, { method: 'GET', headers: {} }).then(function (d) {
        const me = d.socio || {};
        explorer.setOwnProvince(me.provincia);
        if (!me.preferencias_revisadas_at) {
          const note = document.createElement('p');
          note.className = 'pending-banner';
          note.innerHTML = '<strong>Completa tu perfil:</strong> decide si quieres aparecer en el directorio y en el mapa. <a href="/perfil.html">Ir a mi perfil</a>';
          welcomeText.after(note);
        }
        if (!me.bienvenida_vista_at && window.AgesportFichas) {
          window.AgesportFichas.open({ firstAccess: true, tipo: me.tipo_socio, onClose: function () {
            request('/api/socios/bienvenida-vista', { method: 'POST' }).catch(function () {});
          } });
        }
      }).catch(function () {});
    }
    await loadMap();
    explorer.startAutoRefresh();
    if (!adminView) {
      request('/api/mensajeria/estadisticas', {method:'GET'}).then(data => renderMensajeria(data.estadisticas || {})).catch(() => { mensajeriaSummary.textContent='No se pudo consultar la mensajería.'; });
      loadFeed();
    }
  }).catch(function (err) { welcomeText.textContent=err.message; });

  // ===================================================================
  // ==================== FEED DE NOVEDADES ============================
  // ===================================================================
  async function loadFeed() {
    const container = $('feedContent');
    if (!container) return;
    try {
      const data = await request('/api/socios/feed', { method: 'GET', headers: {} });
      const sections = [];
      const rolLabel = function (slug) {
        const r = cat.ROLES_CLUSTER.find(function (x) { return x.slug === slug; });
        return r ? r.label : '';
      };
      const renderPersonas = function (list) {
        if (!list.length) return '<p class="empty">Sin resultados por ahora.</p>';
        return '<div style="display:flex;flex-direction:column;gap:8px">' +
          list.map(function (s) {
            const nom = (s.nombre || '') + ' ' + (s.apellidos || '');
            const meta = [s.entidad, [rolLabel(s.rol_cluster),rolLabel(s.rol_secundario)].filter(Boolean).join(' / '), s.provincia].filter(Boolean).join(' · ');
            const avatar = window.AgesportAvatar
              ? window.AgesportAvatar.renderAvatar({
                  nombre: s.nombre, apellidos: s.apellidos, email: s.email,
                  fotoUrl: s.foto_url, size: 36,
                })
              : '';
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-soft);border-radius:8px;gap:10px">' +
              '<div style="display:flex;align-items:center;gap:10px;min-width:0">' +
                avatar +
                '<div style="min-width:0">' +
                  '<strong style="color:var(--navy-deep);font-size:.94rem;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(nom.trim()) + '</strong>' +
                  '<div class="muted" style="font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(meta || '—') + '</div>' +
                '</div>' +
              '</div>' +
              '<a href="/perfil.html?socioId=' + encodeURIComponent(s.id) + '" style="font-size:.85rem;color:var(--green-deep);text-decoration:none;font-weight:600;flex-shrink:0">Ver perfil →</a>' +
            '</div>';
          }).join('') + '</div>';
      };
      if ((data.altas_cerca || []).length) {
        sections.push({
          title: 'Últimas altas' + (data.provincia_referencia ? ' en ' + data.provincia_referencia : ''),
          body: renderPersonas(data.altas_cerca),
        });
      }
      if ((data.b2b_ofrece || []).length) {
        sections.push({
          title: 'Socios que ofrecen servicios (B2B)',
          body: renderPersonas(data.b2b_ofrece),
        });
      }
      if ((data.b2b_busca || []).length) {
        sections.push({
          title: 'Socios que buscan proveedores (B2B)',
          body: renderPersonas(data.b2b_busca),
        });
      }
      container.innerHTML = sections.length
        ? '<div class="grid-3">' + sections.map(function (s) {
            return '<div>' +
              '<h4 style="margin:0 0 8px;color:var(--navy-deep);font-size:.9rem;font-weight:700">' + escapeHtml(s.title) + '</h4>' +
              s.body +
            '</div>';
          }).join('') + '</div>'
        : '<p class="empty">Aún no hay novedades destacadas.</p>';
    } catch (err) {
      container.innerHTML = '<p class="empty">No se pudo cargar el feed.</p>';
    }
  }

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
    [...new Set(socios.map(s=>s.provincia||'Sin provincia'))].sort((a,b)=>a.localeCompare(b,'es')).forEach(function(p){
      body += bar(p,socios.filter(s=>(s.provincia||'Sin provincia')===p).length,total);
    });
    return chartCard('Distribución por provincia o ciudad autónoma',body);
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
    const g=groupBy(socios,s => s.sector || 'sin_dato');
    const labels={publico:'Sector público',privado:'Sector privado',tercer_sector:'Tercer sector',sin_dato:'Sin declarar'};
    return chartCard('Sector de actividad',Object.keys(g).map(k => bar(labels[k] || 'Sin clasificar',g[k],socios.length)).join(''));
  }

  function chartExperiencia(socios) {
    const total = socios.length;
    if (total === 0) return chartCard('Rango de experiencia', null);
    let junior = 0, medior = 0, senior = 0, sin = 0;
    socios.forEach(function (s) {
      const y = s.anos_experiencia == null ? NaN : Number(s.anos_experiencia);
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
    const altas30 = socios.filter(function (s) { return s.fecha_registro && (now - new Date(s.fecha_registro).getTime()) >= 0 && (now - new Date(s.fecha_registro).getTime()) < 30 * DAY; }).length;
    const altas90 = socios.filter(function (s) { return s.fecha_registro && (now - new Date(s.fecha_registro).getTime()) >= 0 && (now - new Date(s.fecha_registro).getTime()) < 90 * DAY; }).length;
    const activos30 = socios.filter(function (s) { return s.ultimo_acceso && (now - new Date(s.ultimo_acceso).getTime()) >= 0 && (now - new Date(s.ultimo_acceso).getTime()) < 30 * DAY; }).length;
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
