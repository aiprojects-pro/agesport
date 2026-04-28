(function () {
  'use strict';

  const { mountTopbar, request, escapeHtml, parsePgArray } = window.AgesportPortal;
  const D = window.AgesportData;

  let map;
  let markersLayer;
  let socios = [];

  const F = {
    search: '',
    provincias: new Set(),
    roles: new Set(),
    especialidades: new Set(),
    disp: new Set(),
    tipos: new Set()
  };

  function passesFilters(socio) {
    const haystack = [socio.nombre, socio.apellidos, socio.entidad, socio.provincia, socio.localidad].join(' ').toLowerCase();
    if (F.search && haystack.indexOf(F.search) === -1) return false;
    if (F.provincias.size && !F.provincias.has(socio.provincia)) return false;
    if (F.roles.size && !F.roles.has(socio.rol_cluster)) return false;
    if (F.especialidades.size) {
      const ok = parsePgArray(socio.especialidades).some(function (esp) { return F.especialidades.has(esp); });
      if (!ok) return false;
    }
    if (F.disp.size && !F.disp.has(socio.disponibilidad)) return false;
    if (F.tipos.size && !F.tipos.has(socio.tipo_socio || 'numero')) return false;
    return true;
  }

  function paintFilters() {
    document.getElementById('fProvincia').innerHTML = D.PROVINCIAS.map(function (p) {
      return '<span class="chip" data-val="' + p.nombre + '">' + p.nombre + '</span>';
    }).join('');
    document.getElementById('fRol').innerHTML = D.ROLES_CLUSTER.map(function (rol) {
      return '<label class="role-item" data-val="' + rol.id + '"><input type="checkbox"><span class="role-dot" style="background:' + rol.color + '"></span><span style="flex:1">' + rol.nombre + '</span></label>';
    }).join('');
    document.getElementById('fEspecialidad').innerHTML = D.ESPECIALIDADES.map(function (esp) {
      return '<span class="chip" data-val="' + esp + '">' + esp + '</span>';
    }).join('');
    document.getElementById('fDisp').innerHTML = D.DISPONIBILIDADES.map(function (disp) {
      return '<label class="role-item" data-val="' + disp.id + '"><input type="checkbox"><span class="role-dot" style="background:' + disp.color + '"></span><span style="flex:1">' + disp.etiqueta + '</span></label>';
    }).join('');
    document.getElementById('fTipo').innerHTML = D.TIPOS_SOCIO.map(function (tipo) {
      const color = tipo.id === 'numero' ? '#0d355f' : '#e07b5e';
      return '<label class="role-item" data-val="' + tipo.id + '"><input type="checkbox"><span class="role-dot" style="background:' + color + '"></span><span style="flex:1">' + tipo.etiqueta + '</span></label>';
    }).join('');
    document.getElementById('mapLegend').innerHTML = D.ROLES_CLUSTER.map(function (rol) {
      return '<div class="donut-legend-row"><span class="donut-legend-dot" style="background:' + rol.color + '"></span><span>' + rol.nombre + '</span></div>';
    }).join('');
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

  function iconHtml(color) {
    return ''
      + '<div class="map-pin-wrapper">'
      + '  <div class="map-pin" style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:' + color + ';border:2px solid #fff;box-shadow:0 8px 20px rgba(13,53,95,.22)"></div>'
      + '</div>';
  }

  function coordsForSocio(socio) {
    if (socio.latitud && socio.longitud) {
      return { lat: Number(socio.latitud), lng: Number(socio.longitud) };
    }
    return D.provincePoint(socio.provincia, Number(socio.id || 1));
  }

  function render() {
    const filtered = socios.filter(passesFilters);
    document.getElementById('mapaCount').textContent = filtered.length + (filtered.length === 1 ? ' socio mostrado' : ' socios mostrados');
    markersLayer.clearLayers();

    filtered.forEach(function (socio) {
      const rol = D.rolMeta(socio.rol_cluster);
      const coords = coordsForSocio(socio);
      const marker = L.marker([coords.lat, coords.lng], {
        icon: L.divIcon({
          className: 'leaflet-div-icon',
          html: iconHtml(rol.color),
          iconSize: [18, 18],
          iconAnchor: [9, 18]
        })
      });

      marker.bindPopup(
        '<div style="min-width:220px">'
        + '<strong style="color:#0d355f">' + escapeHtml((socio.nombre || '') + ' ' + (socio.apellidos || '')) + '</strong>'
        + '<div style="color:#61717f;margin-top:4px">' + escapeHtml(socio.entidad || '') + '</div>'
        + '<div style="color:#61717f">' + escapeHtml((socio.provincia || '') + ' · ' + (socio.localidad || '')) + '</div>'
        + '<div style="margin-top:8px"><a href="/perfil.html?id=' + encodeURIComponent(socio.id) + '" style="color:#0d355f;font-weight:700">Ver perfil</a></div>'
        + '</div>'
      );

      markersLayer.addLayer(marker);
    });

    if (filtered.length) {
      map.fitBounds(markersLayer.getBounds().pad(0.15));
    }
  }

  mountTopbar('mapa', 'socio').then(async function () {
    paintFilters();
    bindSet('#fProvincia', F.provincias, '.chip');
    bindSet('#fRol', F.roles, '.role-item');
    bindSet('#fEspecialidad', F.especialidades, '.chip');
    bindSet('#fDisp', F.disp, '.role-item');
    bindSet('#fTipo', F.tipos, '.role-item');

    document.getElementById('fSearch').addEventListener('input', function (event) {
      F.search = event.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById('resetFilters').addEventListener('click', function () {
      F.search = '';
      F.provincias.clear();
      F.roles.clear();
      F.especialidades.clear();
      F.disp.clear();
      F.tipos.clear();
      document.getElementById('fSearch').value = '';
      Array.from(document.querySelectorAll('.chip.active, .role-item.active')).forEach(function (node) { node.classList.remove('active'); });
      Array.from(document.querySelectorAll('.filters-panel input[type=checkbox]')).forEach(function (node) { node.checked = false; });
      render();
    });

    map = L.map('mapa', { scrollWheelZoom: true }).setView([37.35, -4.8], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    markersLayer = L.featureGroup().addTo(map);

    const data = await request('/api/socios/directorio?limit=250', { method: 'GET', headers: {} });
    socios = data.socios || [];
    render();
  }).catch(function () {});
})();
