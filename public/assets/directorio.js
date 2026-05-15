(function () {
  const { requireSession, request, logout, escapeHtml, parsePgArray } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;
  const $ = (id) => document.getElementById(id);

  const results = $('results');
  const resultsEmpty = $('resultsEmpty');
  const resultsInfo = $('resultsInfo');
  const searchBtn = $('searchBtn');
  const clearBtn = $('clearBtn');
  const ccaaSelect = $('comunidad_autonoma');
  const provinciaSelect = $('provincia');

  $('logoutBtn').addEventListener('click', logout);

  // Catálogos en los selectores
  cat.COMUNIDADES_AUTONOMAS.forEach(function (ca) {
    const opt = document.createElement('option');
    opt.value = ca.slug;
    opt.textContent = ca.label;
    ccaaSelect.appendChild(opt);
  });
  cat.fillProvincesSelect(provinciaSelect, { placeholder: 'Todas' });

  const rolSelect = $('rol_cluster');
  const todosRol = document.createElement('option');
  todosRol.value = ''; todosRol.textContent = 'Todos los roles';
  rolSelect.appendChild(todosRol);
  cat.ROLES_CLUSTER.forEach(function (r) {
    const opt = document.createElement('option');
    opt.value = r.slug; opt.textContent = r.label;
    rolSelect.appendChild(opt);
  });

  const espSelect = $('especialidad');
  const todasEsp = document.createElement('option');
  todasEsp.value = ''; todasEsp.textContent = 'Todas las especialidades';
  espSelect.appendChild(todasEsp);
  cat.ESPECIALIDADES.forEach(function (e) {
    const opt = document.createElement('option');
    opt.value = e.slug; opt.textContent = e.label;
    espSelect.appendChild(opt);
  });

  // Cascada CCAA → provincias
  ccaaSelect.addEventListener('change', function () {
    if (!ccaaSelect.value) {
      cat.fillProvincesSelect(provinciaSelect, { placeholder: 'Todas' });
      return;
    }
    const ca = cat.COMUNIDADES_AUTONOMAS.find(function (c) { return c.slug === ccaaSelect.value; });
    provinciaSelect.innerHTML = '<option value="">Todas las provincias de ' + escapeHtml(ca.label) + '</option>';
    ca.provincias.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      provinciaSelect.appendChild(opt);
    });
  });

  function buildQuery() {
    const params = new URLSearchParams();
    const search = $('search').value.trim();
    const provincia = provinciaSelect.value.trim();
    const rol = rolSelect.value.trim();
    const especialidad = espSelect.value.trim();
    if (search) params.set('search', search);
    if (provincia) params.set('provincia', provincia);
    if (rol) params.set('rol_cluster', rol);
    if (especialidad) params.set('especialidad', especialidad);
    params.set('limit', '50');
    return params.toString();
  }

  function renderCard(socio) {
    const especialidades = parsePgArray(socio.especialidades);
    const rol = cat.findRolBySlug(socio.rol_cluster);

    let chips = '';
    if (rol) {
      chips += '<span class="rol-chip" data-rol="' + escapeHtml(rol.slug) + '">' + escapeHtml(rol.label) + '</span>';
    }
    especialidades.slice(0, 3).forEach(function (espSlug) {
      const esp = cat.findEspecialidadBySlug(espSlug);
      const label = esp ? esp.label : espSlug;
      chips += '<span class="tag">' + escapeHtml(label) + '</span>';
    });

    let avatar;
    if (socio.foto_url) {
      avatar = '<div class="avatar" style="width:54px;height:54px;background-image:url(\'' + escapeHtml(socio.foto_url) + '\');background-size:cover;background-position:center;border-radius:50%;flex-shrink:0"></div>';
    } else {
      const initials = ((socio.nombre || '?')[0] + (socio.apellidos || '')[0]).toUpperCase();
      avatar = '<div class="avatar" style="width:54px;height:54px;background:linear-gradient(135deg,var(--green) 0%,var(--green-deep) 100%);border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800">' + escapeHtml(initials) + '</div>';
    }

    return (
      '<article class="person-card">' +
        '<div class="person-top">' +
          '<div style="display:flex;gap:12px;align-items:center">' +
            avatar +
            '<div><strong>' + escapeHtml((socio.nombre || '') + ' ' + (socio.apellidos || '')) + '</strong>' +
              '<div class="muted">' + escapeHtml(socio.entidad || socio.provincia || '') + '</div></div>' +
          '</div>' +
          '<div class="actions">' +
            '<a class="btn btn-secondary" href="/perfil.html?id=' + encodeURIComponent(socio.id) + '">Ver perfil</a>' +
            '<a class="btn btn-primary" href="/mensajes.html?receptor=' + encodeURIComponent(socio.id) + '">Contactar</a>' +
          '</div>' +
        '</div>' +
        '<div class="muted">' + escapeHtml(socio.cargo_actual || '') + '</div>' +
        '<div class="person-meta">' + chips + '</div>' +
      '</article>'
    );
  }

  async function load() {
    searchBtn.disabled = true;
    searchBtn.textContent = 'Buscando...';
    try {
      const data = await request('/api/socios/directorio?' + buildQuery(), { method: 'GET', headers: {} });
      const socios = (data.socios || []).filter(function (s) { return s.nombre && s.email; }); // Filtra residuos "32 fantasma"
      resultsInfo.textContent = socios.length + ' perfiles encontrados';
      if (!socios.length) {
        results.innerHTML = '';
        resultsEmpty.style.display = 'block';
        return;
      }
      resultsEmpty.style.display = 'none';
      results.innerHTML = socios.map(renderCard).join('');
    } catch (error) {
      results.innerHTML = '';
      resultsInfo.textContent = error.message;
      resultsEmpty.style.display = 'block';
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = 'Aplicar filtros';
    }
  }

  clearBtn.addEventListener('click', function () {
    $('search').value = '';
    ccaaSelect.value = '';
    cat.fillProvincesSelect(provinciaSelect, { placeholder: 'Todas' });
    rolSelect.value = '';
    espSelect.value = '';
    load();
  });
  searchBtn.addEventListener('click', load);

  // Lectura de filtros desde URL (p.ej. ?provincia=Sevilla al venir del mapa)
  function applyUrlFilters() {
    const url = new URLSearchParams(window.location.search);
    const provincia = url.get('provincia');
    const rol = url.get('rol_cluster');
    const especialidad = url.get('especialidad');
    if (provincia) {
      const ca = cat.findCcaaByProvincia(provincia);
      if (ca) {
        ccaaSelect.value = ca.slug;
        ccaaSelect.dispatchEvent(new Event('change'));
      }
      provinciaSelect.value = provincia;
    }
    if (rol) rolSelect.value = rol;
    if (especialidad) espSelect.value = especialidad;
  }

  requireSession('socio').then(function () {
    applyUrlFilters();
    return load();
  }).catch(function () {});
})();
