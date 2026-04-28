(function () {
  'use strict';

  const { mountTopbar, request, escapeHtml, parsePgArray } = window.AgesportPortal;
  const D = window.AgesportData;
  const F = {
    search: '',
    provincias: new Set(),
    roles: new Set(),
    especialidades: new Set(),
    minAnos: 0,
    disp: new Set(),
    tipos: new Set(),
    b2b: new Set()
  };

  let socios = [];

  function paintFilters() {
    document.getElementById('fProvincia').innerHTML = D.PROVINCIAS.map(function (p) {
      return '<span class="chip" data-val="' + p.nombre + '">' + p.nombre + '</span>';
    }).join('');

    document.getElementById('fRol').innerHTML = D.ROLES_CLUSTER.map(function (rol) {
      return '<label class="role-item" data-val="' + rol.id + '"><input type="checkbox"><span class="role-dot" style="background:' + rol.color + '"></span><span style="flex:1">' + rol.nombre + '</span></label>';
    }).join('');

    document.getElementById('fEspecialidad').innerHTML = D.ESPECIALIDADES.map(function (especialidad) {
      return '<span class="chip" data-val="' + especialidad + '">' + especialidad + '</span>';
    }).join('');

    document.getElementById('fDisp').innerHTML = D.DISPONIBILIDADES.map(function (disp) {
      return '<label class="role-item" data-val="' + disp.id + '"><input type="checkbox"><span class="role-dot" style="background:' + disp.color + '"></span><span style="flex:1">' + disp.etiqueta + '</span></label>';
    }).join('');

    document.getElementById('fTipo').innerHTML = D.TIPOS_SOCIO.map(function (tipo) {
      const color = tipo.id === 'numero' ? '#0d355f' : '#e07b5e';
      return '<label class="role-item" data-val="' + tipo.id + '"><input type="checkbox"><span class="role-dot" style="background:' + color + '"></span><span style="flex:1">' + tipo.etiqueta + '</span></label>';
    }).join('');

    document.getElementById('fB2B').innerHTML = ''
      + '<label class="role-item" data-val="ofrece"><input type="checkbox"><span class="role-dot" style="background:var(--lime-deep)"></span><span style="flex:1">Ofrece servicios</span></label>'
      + '<label class="role-item" data-val="busca"><input type="checkbox"><span class="role-dot" style="background:#4ea7d6"></span><span style="flex:1">Busca colaboradores</span></label>'
      + '<label class="role-item" data-val="licita"><input type="checkbox"><span class="role-dot" style="background:#e07b5e"></span><span style="flex:1">Concurre a licitaciones</span></label>';
  }

  function bindSet(rootSelector, setRef, itemSelector) {
    document.querySelector(rootSelector).addEventListener('click', function (event) {
      const target = event.target.closest(itemSelector);
      if (!target) return;
      const value = target.getAttribute('data-val');
      const checkbox = target.querySelector('input[type=checkbox]');
      if (setRef.has(value)) {
        setRef.delete(value);
        target.classList.remove('active');
        if (checkbox) checkbox.checked = false;
      } else {
        setRef.add(value);
        target.classList.add('active');
        if (checkbox) checkbox.checked = true;
      }
      render();
    });
  }

  function passesFilters(socio) {
    const haystack = [
      socio.nombre,
      socio.apellidos,
      socio.entidad,
      socio.cargo_actual,
      socio.provincia,
      socio.localidad
    ].join(' ').toLowerCase();

    if (F.search && haystack.indexOf(F.search) === -1) return false;
    if (F.provincias.size && !F.provincias.has(socio.provincia)) return false;
    if (F.roles.size && !F.roles.has(socio.rol_cluster)) return false;
    if (F.especialidades.size) {
      const ok = parsePgArray(socio.especialidades).some(function (esp) { return F.especialidades.has(esp); });
      if (!ok) return false;
    }
    if (Number(socio.anos_experiencia || 0) < F.minAnos) return false;
    if (F.disp.size && !F.disp.has(socio.disponibilidad)) return false;
    if (F.tipos.size && !F.tipos.has(socio.tipo_socio || 'numero')) return false;
    if (F.b2b.size) {
      let okB2B = false;
      if (F.b2b.has('ofrece') && socio.b2b_ofrece) okB2B = true;
      if (F.b2b.has('busca') && socio.b2b_busca) okB2B = true;
      if (F.b2b.has('licita') && socio.b2b_licita) okB2B = true;
      if (!okB2B) return false;
    }
    return true;
  }

  function sortSocios(rows) {
    const by = document.getElementById('sortBy').value;
    return rows.slice().sort(function (a, b) {
      if (by === 'anos') return Number(b.anos_experiencia || 0) - Number(a.anos_experiencia || 0);
      if (by === 'provincia') return String(a.provincia || '').localeCompare(String(b.provincia || ''));
      if (by === 'disp') return String(a.disponibilidad || '').localeCompare(String(b.disponibilidad || ''));
      return (String(a.apellidos || '') + String(a.nombre || '')).localeCompare(String(b.apellidos || '') + String(b.nombre || ''));
    });
  }

  function render() {
    const rows = sortSocios(socios.filter(passesFilters));
    document.getElementById('resCount').textContent = rows.length + (rows.length === 1 ? ' socio encontrado' : ' socios encontrados');
    document.getElementById('tabCount').textContent = rows.length;

    const target = document.getElementById('results');
    if (!rows.length) {
      target.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center;padding:50px 20px"><p style="color:var(--muted)">No hay socios que coincidan con los filtros aplicados.</p></div>';
      return;
    }

    target.innerHTML = rows.map(function (socio) {
      const rol = D.rolMeta(socio.rol_cluster);
      const disp = D.dispMeta(socio.disponibilidad || 'Media');
      const tipo = D.tipoSocioMeta(socio.tipo_socio || 'numero');
      const tags = parsePgArray(socio.especialidades).slice(0, 2).map(function (esp) {
        return '<span class="tag-mini">' + escapeHtml(esp) + '</span>';
      }).join('');

      return ''
        + '<a class="person-card" href="/perfil.html?id=' + encodeURIComponent(socio.id) + '">'
        + '  <div class="person-top">'
        + '    <span class="person-avatar" style="background:' + rol.color + '">' + escapeHtml(D.initials(socio.nombre, socio.apellidos)) + '</span>'
        + '    <div style="flex:1;min-width:0">'
        + '      <div class="person-name">' + escapeHtml((socio.nombre || '') + ' ' + (socio.apellidos || '')) + '</div>'
        + '      <div class="person-cargo">' + escapeHtml(socio.cargo_actual || '') + '</div>'
        + '      <div class="person-entidad">' + escapeHtml(socio.entidad || '') + '</div>'
        + '    </div>'
        + '  </div>'
        + '  <div class="person-loc">' + escapeHtml((socio.provincia || '') + ' · ' + (socio.localidad || '')) + '</div>'
        + '  <div class="person-tags">'
        + '    <span class="tag tag-rol-' + escapeHtml(rol.id) + '">' + escapeHtml(rol.nombre.split(' ')[0]) + '</span>'
        + '    <span class="tag ' + (tipo.id === 'numero' ? 'tag-tipo-numero' : 'tag-tipo-corporativo') + '">' + escapeHtml(tipo.etiqueta) + '</span>'
        + tags
        + '  </div>'
        + '  <div class="person-foot">'
        + '    <span class="disp-pill"><span class="disp-dot" style="background:' + disp.color + '"></span>' + escapeHtml(disp.etiqueta.split(' · ')[0]) + '</span>'
        + '    <span class="btn btn-secondary btn-sm">Ver perfil</span>'
        + '  </div>'
        + '</a>';
    }).join('');
  }

  mountTopbar('directorio', 'socio').then(async function () {
    paintFilters();
    bindSet('#fProvincia', F.provincias, '.chip');
    bindSet('#fRol', F.roles, '.role-item');
    bindSet('#fEspecialidad', F.especialidades, '.chip');
    bindSet('#fDisp', F.disp, '.role-item');
    bindSet('#fTipo', F.tipos, '.role-item');
    bindSet('#fB2B', F.b2b, '.role-item');

    document.getElementById('fSearch').addEventListener('input', function (event) {
      F.search = event.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById('fAnos').addEventListener('input', function (event) {
      F.minAnos = parseInt(event.target.value || '0', 10);
      document.getElementById('fAnosVal').textContent = F.minAnos + '+ años';
      render();
    });
    document.getElementById('sortBy').addEventListener('change', render);
    document.getElementById('resetFilters').addEventListener('click', function () {
      F.search = '';
      F.provincias.clear();
      F.roles.clear();
      F.especialidades.clear();
      F.minAnos = 0;
      F.disp.clear();
      F.tipos.clear();
      F.b2b.clear();
      document.getElementById('fSearch').value = '';
      document.getElementById('fAnos').value = 0;
      document.getElementById('fAnosVal').textContent = '0+ años';
      Array.from(document.querySelectorAll('.chip.active, .role-item.active')).forEach(function (node) { node.classList.remove('active'); });
      Array.from(document.querySelectorAll('.filters-panel input[type=checkbox]')).forEach(function (node) { node.checked = false; });
      render();
    });

    const data = await request('/api/socios/directorio?limit=250', { method: 'GET', headers: {} });
    socios = data.socios || [];
    render();
  }).catch(function () {});
})();
