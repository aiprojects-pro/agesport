(function () {
  const M = window.AgesportTalentModel,
    cat = window.AgesportCatalogos,
    e = window.AgesportPortal.escapeHtml;
  const $ = (id) => document.getElementById(id);
  const availability = {
    Alta: { color: '#137458', label: 'Disponibilidad alta' },
    Media: { color: '#2465ad', label: 'Disponibilidad media' },
    Puntual: { color: '#a65b0a', label: 'Disponibilidad puntual' },
    ninguna: { color: '#6f527d', label: 'Sin disponibilidad' },
    sin_dato: { color: '#627184', label: 'Sin declarar' },
  };
  const intents = {
    all: 'Todos los socios',
    collaboration: 'Busco colaboración',
    mentor: 'Mentores',
    speaker: 'Ponentes',
    available: 'Con disponibilidad',
  };
  const bindings = {
    talentSearch: 'search',
    filtroProvincia: 'province',
    filtroRol: 'role',
    filtroEspecialidad: 'specialty',
    mapAvailability: 'availability',
    mapSector: 'sector',
    mapContact: 'contact',
  };
  const defaults = () => ({
    search: '',
    province: '',
    role: '',
    specialty: '',
    availability: '',
    sector: '',
    contact: '',
    intent: 'all',
  });
  const role = (slug) => cat.ROLES_CLUSTER.find((r) => r.slug === slug);
  const specialty = (slug) => (cat.ESPECIALIDADES.find((r) => r.slug === slug) || {}).label || slug;
  class TalentMap {
    constructor({ adminView = false, onChange = () => {} } = {}) {
      this.adminView = adminView;
      this.onChange = onChange;
      this.items = [];
      this.filters = defaults();
      this.colorMode = 'role';
      this.sort = 'name';
      this.loading = false;
      this.loaded = false;
      this.ownProvince = null;
      this.viewerId = null;
      this.markerById = new Map();
      this.selectedId = null;
      this.fillSelect(
        'filtroProvincia',
        cat.COMUNIDADES_AUTONOMAS.flatMap((c) => c.provincias)
          .sort((a, b) => a.localeCompare(b, 'es'))
          .map((p) => ({ value: p, label: p }))
      );
      this.fillSelect(
        'filtroRol',
        cat.ROLES_CLUSTER.map((r) => ({ value: r.slug, label: r.label })).concat([
          { value: 'sin_rol', label: 'Actividad sin declarar' },
        ])
      );
      this.fillSelect(
        'filtroEspecialidad',
        cat.ESPECIALIDADES.map((s) => ({ value: s.slug, label: s.label }))
      );
      for (const [id, key] of Object.entries(bindings))
        $(id).addEventListener(id === 'talentSearch' ? 'input' : 'change', () => {
          this.filters[key] = $(id).value;
          if (id === 'talentSearch') {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => this.apply(), 180);
          } else this.apply();
        });
      $('mapIntents').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-intent]');
        if (b) {
          this.filters.intent = b.dataset.intent;
          this.apply();
        }
      });
      $('myProvince').addEventListener('click', () => {
        this.filters.province = this.filters.province === this.ownProvince ? '' : this.ownProvince;
        this.syncControls();
        this.apply();
      });
      $('filtroReset').addEventListener('click', () => this.reset());
      $('mapActiveFilters').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-clear]');
        if (b) {
          this.filters[b.dataset.clear] = b.dataset.clear === 'intent' ? 'all' : '';
          this.syncControls();
          this.apply();
        }
      });
      $('mapColor').addEventListener('change', () => {
        this.colorMode = $('mapColor').value;
        this.renderList();
        this.renderMarkers();
        this.renderLegend();
      });
      $('mapSort').addEventListener('change', () => {
        this.sort = $('mapSort').value;
        this.renderList();
      });
      $('refreshMap').addEventListener('click', () => this.refresh());
      $('fitMap').addEventListener('click', () => this.fit());
      $('mapList').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-locate]');
        if (b) this.locate(Number(b.dataset.locate));
        if (ev.target.closest('[data-reset]')) this.reset();
      });
      $('rolLegend').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-color-filter]');
        if (!b) return;
        const k = this.colorMode === 'role' ? 'role' : 'availability';
        this.filters[k] = this.filters[k] === b.dataset.colorFilter ? '' : b.dataset.colorFilter;
        this.syncControls();
        this.apply();
      });
      $('mapModeNotice').textContent = adminView
        ? 'Vista de gestión: cuentas aprobadas y activas, incluidas las que han ocultado su mapa a otros socios.'
        : 'Aparecen las cuentas aprobadas y activas que permiten mostrarse en el mapa. Las ubicaciones son aproximadas. Los filtros incluyen la actividad principal y secundaria; los colores muestran la principal.';
      if (typeof L !== 'undefined') {
        this.map = L.map('mapContainer', { scrollWheelZoom: false }).setView([37.2, -4.5], 7);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          attribution: '© OpenStreetMap',
        }).addTo(this.map);
        this.layer = L.layerGroup().addTo(this.map);
        this.map.on('zoomend', () => this.renderMarkers());
        this.resizeObserver = new ResizeObserver(() => {
          this.map.invalidateSize({ pan: true, animate: false });
          this.renderMarkers();
        });
        this.resizeObserver.observe($('mapContainer'));
      } else {
        $('mapContainer').innerHTML =
          '<p class="map-unavailable">No se ha podido cargar el mapa. Puedes consultar todos los perfiles en la lista.</p>';
      }
    }
    fillSelect(id, options) {
      for (const option of options) {
        const el = document.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        $(id).appendChild(el);
      }
    }
    setOwnProvince(province) {
      this.ownProvince = province || null;
      $('myProvince').disabled = !this.ownProvince;
      if (province) $('myProvince').title = 'Buscar en ' + province;
    }
    matches(s) {
      return M.matches(s, this.filters);
    }
    visible() {
      return this.items.filter((s) => this.matches(s));
    }
    syncControls() {
      for (const [id, key] of Object.entries(bindings)) $(id).value = this.filters[key];
    }
    reset() {
      this.filters = defaults();
      this.selectedId = null;
      this.syncControls();
      this.apply();
    }
    apply({ fit = true } = {}) {
      this.renderList();
      this.renderMarkers();
      this.renderLegend();
      this.renderFilterSummary();
      this.onChange(this.items);
      if (fit) this.fit();
    }
    async refresh() {
      if (this.loading) return;
      this.loading = true;
      $('refreshMap').disabled = true;
      this.lastAttempt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(this.adminView ? '/api/admin/mapa' : '/api/socios/mapa', {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          if ([401, 403].includes(response.status)) {
            this.items = [];
            this.apply({ fit: false });
            throw new Error(
              'Tu sesión ha terminado. Vuelve a iniciar sesión para consultar el mapa.'
            );
          }
          throw new Error('No se pudo actualizar. Los resultados conservan la última consulta.');
        }
        const data = await response.json();
        if (!Array.isArray(data.socios)) throw new Error('La respuesta del mapa no es válida.');
        const items = data.socios.map((s) => ({
          ...s,
          searchLabels: [
            role(s.rol_cluster)?.label,
            role(s.rol_secundario)?.label,
            ...(s.especialidades || []).map(specialty),
          ]
            .filter(Boolean)
            .join(' '),
        }));
        const signature = JSON.stringify(items);
        const changed = signature !== this.signature;
        this.items = items;
        if (changed || !this.loaded) {
          this.signature = signature;
          this.apply({ fit: !this.loaded });
        }
        this.loaded = true;
        this.lastSuccess = new Date();
        $('mapUpdated').textContent =
          'Actualizado a las ' +
          this.lastSuccess.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }) +
          ' · automático cada minuto';
        $('mapUpdated').closest('.live-status').classList.remove('is-stale');
      } catch (error) {
        $('mapUpdated').textContent =
          (error.name === 'AbortError'
            ? 'La actualización ha tardado demasiado. Pulsa Actualizar para reintentar.'
            : error.message) +
          (this.lastSuccess
            ? ' Última consulta: ' + this.lastSuccess.toLocaleTimeString('es-ES') + '.'
            : '');
        if (!this.loaded) {
          $('mapListCount').textContent = 'No se pudo cargar la lista';
          $('mapList').innerHTML =
            '<p class="map-empty">Pulsa Actualizar para volver a intentarlo. <a href="/acceso.html">Ir al acceso</a></p>';
        }
        $('mapUpdated').closest('.live-status').classList.add('is-stale');
      } finally {
        clearTimeout(timeout);
        this.loading = false;
        $('refreshMap').disabled = false;
      }
    }
    startAutoRefresh() {
      if (this.timer) return;
      this.timer = setInterval(() => {
        if (!document.hidden) this.refresh();
      }, 60000);
      const resume = () => {
        if (!document.hidden && Date.now() - this.lastAttempt > 2500) this.refresh();
      };
      window.addEventListener('focus', resume);
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('pageshow', resume);
    }
    fit() {
      if (!this.map) return;
      const coords = this.visible()
        .filter(M.located)
        .map((s) => [s.lat, s.lng]);
      if (coords.length)
        this.map.fitBounds(coords, { padding: [40, 40], maxZoom: 11, animate: false });
      this.renderMarkers();
    }
    color(s) {
      return this.colorMode === 'availability'
        ? (availability[s.disponibilidad] || availability.sin_dato).color
        : role(s.rol_cluster)?.color || '#627184';
    }
    name(s) {
      return [s.nombre, s.apellidos].filter(Boolean).join(' ') || 'Perfil sin nombre';
    }
    activity(s) {
      return (
        [...new Set([s.rol_cluster, s.rol_secundario].filter(Boolean))]
          .map((r) => role(r)?.label || r)
          .join(' · ') || 'Actividad pendiente de completar'
      );
    }
    actions(s) {
      return (
        (!this.adminView && s.perfil_visible
          ? '<a class="talent-profile" href="/perfil.html?socioId=' +
            encodeURIComponent(s.id) +
            '">Ver perfil</a>'
          : '') +
        (!this.adminView && s.mensajeria && s.id !== this.viewerId
          ? '<a class="talent-message" href="/mensajes.html?receptor=' +
            encodeURIComponent(s.id) +
            '">Enviar mensaje</a>'
          : '')
      );
    }
    card(s) {
      const tags = [];
      if (s.tutor_mentor) tags.push('Mentoría');
      if (s.ponente) tags.push('Ponencias');
      if (s.b2b_ofrece) tags.push('Ofrece colaboración');
      if (s.b2b_busca) tags.push('Busca colaboración');
      if (s.b2b_licita) tags.push('Licitaciones');
      const initials = [s.nombre, s.apellidos]
        .filter(Boolean)
        .map((t) => t.trim()[0])
        .join('')
        .slice(0, 2);
      return (
        '<article class="talent-person' +
        (this.selectedId === s.id ? ' is-selected' : '') +
        '" data-person="' +
        e(s.id) +
        '"><div class="person-heading"><span class="talent-avatar" style="--person-color:' +
        this.color(s) +
        '" aria-hidden="true">' +
        e(initials) +
        '</span><div><h4>' +
        e(this.name(s)) +
        '</h4><p>' +
        e(s.entidad || 'Entidad sin indicar') +
        '</p></div></div><p class="person-role">' +
        e(this.activity(s)) +
        '</p><p class="person-location">' +
        e([s.localidad, s.provincia].filter(Boolean).join(' · ')) +
        (s.precision === 'provincia'
          ? ' · Referencia provincial'
          : s.precision === 'pendiente'
            ? ' · Ubicación pendiente'
            : '') +
        '</p><div class="person-tags"><span class="availability-tag" style="--tag-color:' +
        (availability[s.disponibilidad] || availability.sin_dato).color +
        '">' +
        e((availability[s.disponibilidad] || availability.sin_dato).label) +
        '</span>' +
        tags.map((t) => '<span>' + e(t) + '</span>').join('') +
        '</div>' +
        (s.especialidades?.length
          ? '<p class="person-specialties">' +
            e(s.especialidades.slice(0, 2).map(specialty).join(' · ')) +
            (s.especialidades.length > 2 ? ' · +' + (s.especialidades.length - 2) : '') +
            '</p>'
          : '') +
        '<div class="person-actions">' +
        this.actions(s) +
        (M.located(s)
          ? '<button type="button" data-locate="' +
            e(s.id) +
            '" aria-label="Localizar a ' +
            e(this.name(s)) +
            ' en el mapa">Localizar</button>'
          : '') +
        '</div></article>'
      );
    }
    renderList() {
      const visible = M.sort(this.visible(), this.sort);
      const count = visible.length;
      $('mapListCount').textContent =
        count +
        ' ' +
        (count === 1 ? 'socio encontrado' : 'socios encontrados') +
        ' de ' +
        this.items.length;
      const list = $('mapList'),
        top = list.scrollTop;
      const focused = list.contains(document.activeElement) ? document.activeElement : null;
      const personId = focused?.closest('[data-person]')?.dataset.person;
      const actionIndex = focused
        ? [...(focused.closest('[data-person]')?.querySelectorAll('a,button') || [])].indexOf(
            focused
          )
        : -1;
      list.innerHTML = count
        ? visible.map((s) => this.card(s)).join('')
        : '<div class="map-empty"><strong>Tu próxima conexión puede estar a un filtro de distancia.</strong><p>No hay perfiles que cumplan esta combinación. Prueba otra provincia o amplía la especialidad.</p><button type="button" class="btn btn-secondary" data-reset>Mostrar todos los socios</button></div>';
      list.scrollTop = top;
      if (personId && actionIndex >= 0) {
        const actions = list
          .querySelector('[data-person="' + personId + '"]')
          ?.querySelectorAll('a,button');
        actions?.[actionIndex]?.focus({ preventScroll: true });
      }
    }
    renderMarkers() {
      const visible = this.visible(),
        positioned = visible.filter(M.located),
        missing = visible.length - positioned.length;
      if (!this.map) {
        $('mapPointCount').textContent =
          positioned.length + ' personas con ubicación · mapa no disponible';
        return;
      }
      const open = this.openGroupId;
      this.layer.clearLayers();
      this.markerById.clear();
      const groups = M.clusters(
        positioned,
        (s) => this.map.latLngToContainerPoint([s.lat, s.lng]),
        46
      );
      for (const g of groups) {
        const colors = {};
        g.members.forEach((s) => {
          const c = this.color(s);
          colors[c] = (colors[c] || 0) + 1;
        });
        let start = 0;
        const stops = Object.entries(colors).map(([color, n]) => {
          const from = start;
          start += (n / g.members.length) * 100;
          return color + ' ' + from + '% ' + start + '%';
        });
        const title =
          g.members.length === 1
            ? this.name(g.members[0])
            : g.members.length +
              ' socios: ' +
              [...new Set(g.members.map((s) => s.provincia))].join(', ');
        const marker = L.marker([g.lat, g.lng], {
          keyboard: true,
          title,
          icon: L.divIcon({
            className: 'talent-pin-shell',
            iconSize: [42, 42],
            iconAnchor: [21, 21],
            html:
              '<span class="talent-pin" style="background:conic-gradient(' +
              stops.join(',') +
              ')"><span>' +
              g.members.length +
              '</span></span>',
          }),
        });
        marker.bindTooltip(e(title), { direction: 'top', offset: [0, -18] });
        const wrap = document.createElement('div');
        wrap.className = 'talent-popup';
        wrap.innerHTML =
          '<strong>' +
          g.members.length +
          ' ' +
          (g.members.length === 1 ? 'persona en esta ubicación' : 'personas en este grupo') +
          '</strong><p class="muted">Ubicaciones aproximadas. Todos los perfiles del grupo:</p><div>' +
          g.members
            .map(
              (s) =>
                '<section><b>' +
                e(this.name(s)) +
                '</b><p>' +
                e(this.activity(s)) +
                '</p><p>' +
                e([s.localidad, s.provincia].filter(Boolean).join(' · ')) +
                '</p><div>' +
                this.actions(s) +
                '<button type="button" data-show-person="' +
                e(s.id) +
                '">Ver en la lista</button></div></section>'
            )
            .join('') +
          '</div>';
        wrap.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-show-person]');
          if (b) {
            this.selectPerson(Number(b.dataset.showPerson));
          }
        });
        if (g.members.length > 1 && new Set(g.members.map((s) => s.lat + ',' + s.lng)).size > 1) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-secondary';
          btn.textContent = 'Acercar este grupo';
          btn.onclick = () =>
            this.map.fitBounds(
              g.members.map((s) => [s.lat, s.lng]),
              { padding: [40, 40], maxZoom: 15, animate: false }
            );
          wrap.prepend(btn);
        }
        marker.bindPopup(wrap, {
          maxWidth: 330,
          maxHeight: 260,
          autoPan: true,
          autoPanPadding: [24, 24],
        });
        marker.on('popupopen', () => {
          this.openGroupId = g.members[0].id;
        });
        marker.on('popupclose', () => {
          this.openGroupId = null;
        });
        this.layer.addLayer(marker);
        g.members.forEach((s) => this.markerById.set(s.id, marker));
      }
      if (open && this.markerById.has(open)) this.markerById.get(open).openPopup();
      $('mapPointCount').textContent =
        positioned.length +
        ' personas · ' +
        groups.length +
        ' ' +
        (groups.length === 1 ? 'grupo' : 'grupos') +
        (missing ? ' · ' + missing + ' sin ubicación (en la lista)' : '');
    }
    selectPerson(id) {
      this.selectedId = id;
      this.renderList();
      const card = $('mapList').querySelector('[data-person="' + id + '"]');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const action = card.querySelector('a,button');
        if (action) action.focus({ preventScroll: true });
      }
    }
    locate(id) {
      const s = this.items.find((s) => s.id === id);
      if (!s || !M.located(s) || !this.map) return;
      this.selectedId = id;
      this.map.setView([s.lat, s.lng], Math.max(this.map.getZoom(), 11), { animate: false });
      this.renderMarkers();
      this.markerById.get(id)?.openPopup();
      this.renderList();
      $('mapContainer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    renderLegend() {
      const key = this.colorMode === 'role' ? 'role' : 'availability';
      const candidates = this.items.filter((s) => M.matches(s, { ...this.filters, [key]: '' }));
      const choices =
        key === 'role'
          ? cat.ROLES_CLUSTER.map((r) => ({
              value: r.slug,
              label: r.label,
              color: r.color,
            })).concat([{ value: 'sin_rol', label: 'Sin actividad declarada', color: '#627184' }])
          : Object.entries(availability).map(([value, v]) => ({ value, ...v }));
      $('rolLegend').innerHTML = choices
        .map((c) => {
          const count = candidates.filter((s) => M.matches(s, { [key]: c.value })).length;
          if (!count && this.filters[key] !== c.value) return '';
          return (
            '<button type="button" data-color-filter="' +
            e(c.value) +
            '" aria-pressed="' +
            (this.filters[key] === c.value) +
            '"><span style="background:' +
            c.color +
            '" aria-hidden="true"></span>' +
            e(c.label) +
            ' <b>' +
            count +
            '</b></button>'
          );
        })
        .join('');
    }
    renderFilterSummary() {
      for (const b of $('mapIntents').querySelectorAll('[data-intent]')) {
        b.setAttribute('aria-pressed', b.dataset.intent === this.filters.intent ? 'true' : 'false');
        const count = this.items.filter((s) =>
          M.matches(s, { ...this.filters, intent: b.dataset.intent })
        ).length;
        b.querySelector('span').textContent = count;
      }
      $('myProvince').setAttribute(
        'aria-pressed',
        this.filters.province && this.filters.province === this.ownProvince ? 'true' : 'false'
      );
      const names = {
        search: 'Búsqueda',
        province: 'Provincia',
        role: 'Actividad',
        specialty: 'Especialidad',
        availability: 'Disponibilidad',
        sector: 'Sector',
        contact: 'Contacto',
        intent: 'Objetivo',
      };
      $('mapActiveFilters').innerHTML = Object.entries(this.filters)
        .filter(([k, v]) => v && !(k === 'intent' && v === 'all'))
        .map(([k, v]) => {
          let label = v;
          if (k === 'role') label = role(v)?.label || 'Sin actividad';
          if (k === 'specialty') label = specialty(v);
          if (k === 'intent') label = intents[v];
          if (k === 'availability') label = (availability[v] || {}).label || v;
          if (k === 'contact') label = 'Aceptan mensajes';
          if (k === 'sector')
            label = { publico: 'Público', privado: 'Privado', tercer_sector: 'Tercer sector' }[v];
          return (
            '<button type="button" data-clear="' +
            k +
            '" aria-label="Quitar filtro ' +
            e(names[k] + ': ' + label) +
            '">' +
            e(label) +
            ' <span aria-hidden="true">×</span></button>'
          );
        })
        .join('');
      const n = ['specialty', 'availability', 'sector', 'contact'].filter(
        (k) => this.filters[k]
      ).length;
      $('extraFilterCount').textContent = n ? '(' + n + ')' : '';
    }
  }
  window.AgesportTalentMap = TalentMap;
})();
