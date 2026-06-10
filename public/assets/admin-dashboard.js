(function () {
  const { requireSession, request, logout, escapeHtml, setMessage, formatDate } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;
  const $ = (id) => document.getElementById(id);

  // Mapea el slug del tipo de socio a la etiqueta legible.
  // Sin esto, las tablas mostraban el valor crudo "numero" en lugar
  // de "Socio/a de número" (hallazgo BAJA auditoría 10 jun).
  function tipoSocioLabel(slug) {
    if (!slug) return '';
    const tipos = (cat && cat.TIPOS_SOCIO) || [];
    const t = tipos.find(function (x) { return x.slug === slug; });
    return t ? t.label : slug;
  }

  // Normaliza variantes mal escritas del nombre "AGESPORT" (p. ej.
  // "AGSport" introducido manualmente en BD) — auditoría 10 jun B1.
  function normalizeBrand(text) {
    if (!text) return text;
    return String(text)
      .replace(/\bAGSport\b/gi, 'AGESPORT')
      .replace(/\bAgesport\b/g, 'AGESPORT');
  }

  document.getElementById('logoutBtn').addEventListener('click', logout);

  // ===== Tabs =====
  const tabsRoot = document.getElementById('adminTabs');
  tabsRoot.addEventListener('click', function (ev) {
    const btn = ev.target.closest('.tab');
    if (!btn) return;
    Array.from(tabsRoot.querySelectorAll('.tab')).forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    const which = btn.dataset.tab;
    Array.from(document.querySelectorAll('.tab-panel')).forEach(function (p) {
      p.classList.toggle('active', p.dataset.panel === which);
    });
    if (which === 'dashboard') loadDashboard();
    if (which === 'identidad' && !window._orgLoaded) loadOrganizacion();
    if (which === 'pendientes' && !window._pendLoaded) loadPendientes();
    if (which === 'accesos' && !window._accLoaded) loadAccesos();
    if (which === 'bajas' && !window._bajasLoaded) loadBajas();
  });

  document.getElementById('refreshBtn').addEventListener('click', function () {
    window._orgLoaded = window._pendLoaded = window._accLoaded = window._bajasLoaded = false;
    loadDashboard();
    const activeTab = tabsRoot.querySelector('.tab.active').dataset.tab;
    if (activeTab === 'identidad') loadOrganizacion();
    if (activeTab === 'pendientes') loadPendientes();
    if (activeTab === 'accesos') loadAccesos();
    if (activeTab === 'bajas') loadBajas();
  });

  // =============================================================
  // ==================== DASHBOARD ==============================
  // =============================================================
  async function loadDashboard() {
    try {
      const data = await request('/api/admin/estadisticas', { method: 'GET', headers: {} });
      // El backend devuelve la clave `stats` (no `estadisticas`).
      const stats = data.stats || data.estadisticas || {};

      const kpis = [
        { label: 'Socios activos', value: stats.socios_activos || 0, desc: 'Aprobados y activos', highlight: true },
        { label: 'Solicitudes pendientes', value: stats.socios_pendientes || 0, desc: 'Esperando aprobación' },
        { label: 'Mensajes último mes', value: stats.mensajes_ultimo_mes || 0, desc: 'Volumen actividad mensajería' },
        { label: 'Conversaciones activas', value: stats.conversaciones_activas || 0, desc: 'Hilos abiertos' }
      ];
      $('adminKpis').innerHTML = kpis.map(function (k) {
        return '<article class="metric ' + (k.highlight ? 'highlight' : '') + '">' +
          '<small>' + k.label + '</small><strong>' + escapeHtml(k.value) + '</strong>' +
          '<span>' + k.desc + '</span></article>';
      }).join('');

      const tp = $('topProvincias');
      tp.innerHTML = (stats.provincias_mas_activas || []).slice(0, 6).map(function (p) {
        return '<li>' + escapeHtml(p.provincia || '-') + ' — ' + escapeHtml(p.total || 0) + ' socios</li>';
      }).join('') || '<li>Sin datos</li>';

      const te = $('topEspecialidades');
      const obsRes = await request('/api/socios/observatorio/stats', { method: 'GET', headers: {} }).catch(function () { return null; });
      const topEsp = obsRes && obsRes.charts ? (obsRes.charts.top_especialidades || []) : [];
      te.innerHTML = topEsp.slice(0, 6).map(function (e) {
        const esp = cat.findEspecialidadBySlug(e.especialidad);
        return '<li>' + escapeHtml(esp ? esp.label : e.especialidad) + ' — ' + escapeHtml(e.total || 0) + '</li>';
      }).join('') || '<li>Sin datos</li>';

      const act = $('actividadReciente');
      const acciones = (stats.actividad_reciente || []).slice(0, 12);
      act.innerHTML = acciones.length
        ? '<ul style="margin:0;padding-left:18px">' + acciones.map(function (a) {
            return '<li>' + escapeHtml(a.accion || '') + ' · ' + escapeHtml(a.tabla_afectada || '') + ' · ' + escapeHtml(formatDate(a.created_at)) + '</li>';
          }).join('') + '</ul>'
        : 'Sin actividad reciente registrada.';
    } catch (err) {
      $('adminKpis').innerHTML = '<div class="empty">No se pudieron cargar las estadísticas: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // =============================================================
  // ==================== IDENTIDAD ORG ==========================
  // =============================================================
  const orgCCAA = $('orgCCAA');
  const orgProvincia = $('orgProvincia');
  cat.COMUNIDADES_AUTONOMAS.forEach(function (ca) {
    const opt = document.createElement('option');
    opt.value = ca.slug; opt.textContent = ca.label;
    orgCCAA.appendChild(opt);
  });
  cat.fillProvincesSelect(orgProvincia, { placeholder: 'Selecciona provincia' });
  orgCCAA.addEventListener('change', function () {
    if (!orgCCAA.value) { cat.fillProvincesSelect(orgProvincia, { placeholder: 'Selecciona provincia' }); return; }
    const ca = cat.COMUNIDADES_AUTONOMAS.find(function (c) { return c.slug === orgCCAA.value; });
    orgProvincia.innerHTML = '<option value="">Selecciona provincia</option>';
    ca.provincias.forEach(function (p) {
      const o = document.createElement('option');
      o.value = p; o.textContent = p;
      orgProvincia.appendChild(o);
    });
  });

  const orgColoresEl = $('orgColores');
  let coloresEditados = ['#0d355f', '#6da93f', '#37964f'];

  function renderColores() {
    orgColoresEl.innerHTML = coloresEditados.map(function (c, idx) {
      return '<div class="color-swatch" style="background:' + escapeHtml(c) + '" data-idx="' + idx + '">' +
        '<input type="color" value="' + escapeHtml(c) + '" data-idx="' + idx + '">' +
        '<button type="button" class="remove" data-remove="' + idx + '" title="Quitar">×</button>' +
      '</div>';
    }).join('') + '<div class="color-swatch add" id="orgColorAdd">+</div>';
  }
  orgColoresEl.addEventListener('input', function (ev) {
    if (ev.target.tagName === 'INPUT' && ev.target.type === 'color') {
      coloresEditados[parseInt(ev.target.dataset.idx)] = ev.target.value;
      const swatch = ev.target.closest('.color-swatch');
      if (swatch) swatch.style.background = ev.target.value;
    }
  });
  orgColoresEl.addEventListener('click', function (ev) {
    if (ev.target.id === 'orgColorAdd' || ev.target.closest('#orgColorAdd')) {
      coloresEditados.push('#37964f');
      renderColores();
    } else if (ev.target.dataset.remove !== undefined) {
      ev.stopPropagation();
      coloresEditados.splice(parseInt(ev.target.dataset.remove), 1);
      renderColores();
    }
  });

  async function loadOrganizacion() {
    window._orgLoaded = true;
    try {
      const data = await request('/api/admin/organizacion', { method: 'GET', headers: {} });
      const org = data.organizacion;
      $('orgNombre').value = org.nombre || '';
      $('orgTipo').value = org.tipo_organizacion || '';
      $('orgWeb').value = org.web_institucional || '';
      $('orgDescripcion').value = org.descripcion_breve || '';
      $('orgEmailRem').value = org.email_remitente || '';
      if (org.comunidad_autonoma) {
        orgCCAA.value = org.comunidad_autonoma;
        orgCCAA.dispatchEvent(new Event('change'));
      }
      if (org.provincia) orgProvincia.value = org.provincia;
      if (org.logo_url) $('orgLogoPreview').src = org.logo_url;
      const cols = Array.isArray(org.colores_corporativos)
        ? org.colores_corporativos
        : (typeof org.colores_corporativos === 'string' ? JSON.parse(org.colores_corporativos) : ['#0d355f','#6da93f','#37964f']);
      coloresEditados = cols.length ? cols : ['#0d355f','#6da93f','#37964f'];
      renderColores();
    } catch (err) {
      setMessage($('orgMessage'), false, err.message);
    }
  }

  $('orgForm').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    $('orgSaveBtn').disabled = true;
    $('orgSaveBtn').textContent = 'Guardando...';
    try {
      await request('/api/admin/organizacion', {
        method: 'PUT',
        body: JSON.stringify({
          nombre: $('orgNombre').value.trim(),
          tipo_organizacion: $('orgTipo').value.trim(),
          comunidad_autonoma: orgCCAA.value || null,
          provincia: orgProvincia.value || null,
          web_institucional: $('orgWeb').value.trim(),
          descripcion_breve: $('orgDescripcion').value.trim(),
          email_remitente: $('orgEmailRem').value.trim() || null,
          colores_corporativos: coloresEditados
        })
      });
      setMessage($('orgMessage'), true, 'Identidad guardada correctamente.');
    } catch (err) {
      setMessage($('orgMessage'), false, err.message);
    } finally {
      $('orgSaveBtn').disabled = false;
      $('orgSaveBtn').textContent = 'Guardar identidad';
    }
  });

  $('orgLogoInput').addEventListener('change', async function () {
    if (!$('orgLogoInput').files || !$('orgLogoInput').files[0]) return;
    const fd = new FormData();
    fd.append('logo', $('orgLogoInput').files[0]);
    setMessage($('orgMessage'), true, 'Subiendo logo...');
    try {
      const res = await fetch('/api/admin/organizacion/logo', { method: 'POST', credentials: 'same-origin', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo logo');
      $('orgLogoPreview').src = data.logo_url;
      setMessage($('orgMessage'), true, 'Logo actualizado.');
    } catch (err) {
      setMessage($('orgMessage'), false, err.message);
    }
  });

  // =============================================================
  // ==================== PENDIENTES =============================
  // =============================================================
  async function loadPendientes() {
    window._pendLoaded = true;
    try {
      const data = await request('/api/admin/socios/pendientes', { method: 'GET', headers: {} });
      const socios = data.socios || [];
      // B3 (auditoría 10 jun): los botones masivos no deben estar
      // habilitados cuando no hay nada que aprobar. Ajustamos su
      // estado tanto en el caso vacío como en el caso poblado.
      const selectAllBtn = $('selectAllPendBtn');
      const approveBtn = $('approveSelectedBtn');
      if (selectAllBtn) selectAllBtn.disabled = socios.length === 0;
      if (approveBtn) approveBtn.disabled = socios.length === 0;

      if (!socios.length) {
        $('pendientesList').innerHTML = '';
        $('pendientesEmpty').style.display = 'block';
        return;
      }
      $('pendientesEmpty').style.display = 'none';
      $('pendientesList').innerHTML = '<table class="table-list"><thead><tr>' +
          '<th style="width:36px"><input type="checkbox" id="pendSelectAll"></th>' +
          '<th>Nombre</th><th>Email</th><th>Entidad</th><th>Provincia</th><th>Rol</th><th></th>' +
        '</tr></thead><tbody>' +
        socios.map(function (s) {
          const rol = cat.findRolBySlug(s.rol_cluster);
          return '<tr class="selectable-row" data-id="' + s.id + '">' +
            '<td><input type="checkbox" class="pend-check" data-id="' + s.id + '"></td>' +
            '<td>' + escapeHtml((s.nombre || '') + ' ' + (s.apellidos || '')) + '</td>' +
            '<td>' + escapeHtml(s.email || '') + '</td>' +
            '<td>' + escapeHtml(s.entidad || '') + '</td>' +
            '<td>' + escapeHtml(s.provincia || '') + '</td>' +
            '<td>' + (rol ? '<span class="rol-chip" data-rol="' + rol.slug + '">' + escapeHtml(rol.label) + '</span>' : '-') + '</td>' +
            '<td><button class="btn-upload" type="button" data-reject="' + s.id + '">Rechazar</button></td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';

      $('pendSelectAll').addEventListener('change', function () {
        const checked = $('pendSelectAll').checked;
        Array.from(document.querySelectorAll('.pend-check')).forEach(function (cb) {
          cb.checked = checked;
          cb.closest('tr').classList.toggle('selected', checked);
        });
      });

      Array.from(document.querySelectorAll('.pend-check')).forEach(function (cb) {
        cb.addEventListener('change', function () {
          cb.closest('tr').classList.toggle('selected', cb.checked);
        });
      });

      Array.from(document.querySelectorAll('[data-reject]')).forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!window.confirm('¿Rechazar esta solicitud?')) return;
          try {
            await request('/api/admin/socios/' + btn.dataset.reject + '/rechazar', {
              method: 'POST', body: JSON.stringify({ motivo: 'Rechazado por administración' })
            });
            await loadPendientes();
          } catch (err) {
            setMessage($('pendientesMessage'), false, err.message);
          }
        });
      });
    } catch (err) {
      setMessage($('pendientesMessage'), false, err.message);
    }
  }

  $('selectAllPendBtn').addEventListener('click', function () {
    const sel = $('pendSelectAll');
    if (sel) { sel.checked = !sel.checked; sel.dispatchEvent(new Event('change')); }
  });

  $('approveSelectedBtn').addEventListener('click', async function () {
    const ids = Array.from(document.querySelectorAll('.pend-check:checked')).map(function (cb) { return cb.dataset.id; });
    if (!ids.length) { setMessage($('pendientesMessage'), false, 'No has seleccionado ninguna solicitud.'); return; }
    if (!window.confirm('¿Aprobar ' + ids.length + ' solicitudes? Se notificará a cada socio por email.')) return;

    let ok = 0, fail = 0;
    for (const id of ids) {
      try {
        await request('/api/admin/socios/' + id + '/aprobar', { method: 'POST', body: JSON.stringify({}) });
        ok++;
      } catch (err) {
        fail++;
        console.warn('Error aprobando ' + id, err);
      }
    }
    setMessage($('pendientesMessage'), fail === 0, 'Aprobadas ' + ok + ' de ' + ids.length + (fail ? ' (' + fail + ' errores)' : ''));
    await loadPendientes();
  });

  // =============================================================
  // ==================== ACCESOS GENERADOS ======================
  // =============================================================
  async function loadAccesos() {
    window._accLoaded = true;
    try {
      const data = await request('/api/admin/socios/accesos', { method: 'GET', headers: {} });
      const socios = data.socios || [];
      $('accesosList').innerHTML = '<table class="table-list"><thead><tr>' +
          '<th>Nombre</th><th>Email</th><th>Entidad</th><th>Provincia</th><th>Tipo</th>' +
          '<th>Último acceso</th><th style="text-align:right">Acciones</th>' +
        '</tr></thead><tbody>' +
        socios.map(function (s) {
          return '<tr>' +
            '<td>' + escapeHtml((s.nombre || '') + ' ' + (s.apellidos || '')) + '</td>' +
            '<td>' + escapeHtml(s.email || '') + '</td>' +
            '<td>' + escapeHtml(s.entidad || '') + '</td>' +
            '<td>' + escapeHtml(s.provincia || '') + '</td>' +
            '<td>' + escapeHtml(tipoSocioLabel(s.tipo_socio)) + '</td>' +
            '<td>' + escapeHtml(s.ultimo_acceso ? formatDate(s.ultimo_acceso) : '—') + '</td>' +
            '<td style="text-align:right;white-space:nowrap">' +
              '<button class="btn-upload" type="button" data-suspend="' + s.id + '">Suspender</button> ' +
              '<button class="btn-upload" type="button" data-baja="' + s.id + '" style="color:#a33">Dar de baja</button>' +
            '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table>';

      // Wire suspender
      Array.from(document.querySelectorAll('[data-suspend]')).forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const motivo = window.prompt('Motivo de la suspensión (se guarda en notas de moderación):');
          if (motivo === null) return;
          if (!motivo.trim()) { window.alert('El motivo es requerido.'); return; }
          try {
            await request('/api/admin/socios/' + btn.dataset.suspend + '/suspender', {
              method: 'POST', body: JSON.stringify({ motivo: motivo.trim() })
            });
            await loadAccesos();
          } catch (err) {
            window.alert('Error: ' + err.message);
          }
        });
      });

      // Wire dar de baja administrativa
      Array.from(document.querySelectorAll('[data-baja]')).forEach(function (btn) {
        btn.addEventListener('click', async function () {
          if (!window.confirm('¿Dar de baja a este socio? Sus mensajes quedarán anonimizados y desaparecerá del directorio. La acción es reversible reactivando manualmente.')) return;
          const motivo = window.prompt('Motivo de la baja (ej. "impago de cuota"):', 'Impago de cuota');
          if (motivo === null) return;
          try {
            await request('/api/admin/socios/' + btn.dataset.baja + '/dar-baja', {
              method: 'POST', body: JSON.stringify({ motivo: (motivo || '').trim() || null })
            });
            await loadAccesos();
          } catch (err) {
            window.alert('Error: ' + err.message);
          }
        });
      });
    } catch (err) {
      $('accesosList').innerHTML = '<div class="empty">' + escapeHtml(err.message) + '</div>';
    }
  }

  // ===== Exportar CSV de contactos =====
  // Usamos fetch + blob para que las cookies/credenciales viajen igual que en el
  // resto de llamadas autenticadas, y para poder forzar un nombre de fichero.
  $('exportCsvBtn').addEventListener('click', async function () {
    const btn = $('exportCsvBtn');
    const estado = $('exportEstado').value;
    btn.disabled = true;
    btn.textContent = 'Generando CSV…';
    try {
      const url = '/api/admin/socios/exportar' + (estado ? ('?estado=' + encodeURIComponent(estado)) : '');
      const res = await fetch(url, { method: 'GET', credentials: 'same-origin' });
      if (!res.ok) {
        let msg = 'Error generando CSV';
        try { const j = await res.json(); msg = j.error || msg; } catch (e) { /* ignore */ }
        throw new Error(msg);
      }

      // Extraer nombre de fichero del header si está disponible
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const fecha = new Date().toISOString().slice(0, 10);
      const fallback = 'agesport-socios' + (estado ? ('-' + estado) : '') + '-' + fecha + '.csv';
      const filename = match ? match[1] : fallback;

      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);

      setMessage($('exportMessage'), true, 'Descarga iniciada: ' + filename);
    } catch (err) {
      setMessage($('exportMessage'), false, err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Descargar contactos (CSV)';
    }
  });

  // =============================================================
  // ==================== BAJAS ==================================
  // =============================================================
  async function loadBajas() {
    window._bajasLoaded = true;
    try {
      const data = await request('/api/admin/bajas', { method: 'GET', headers: {} });
      const bajas = data.bajas || [];
      if (!bajas.length) {
        $('bajasList').innerHTML = '';
        $('bajasEmpty').style.display = 'block';
        return;
      }
      $('bajasEmpty').style.display = 'none';
      $('bajasList').innerHTML = bajas.map(function (b) {
        return '<article class="card" style="margin-bottom:12px">' +
          '<div class="toolbar">' +
            '<div><strong>' + escapeHtml((b.nombre || '') + ' ' + (b.apellidos || '')) + '</strong>' +
            '<div class="muted">' + escapeHtml(b.email || '') + ' · ' + escapeHtml(b.entidad || '') + '</div></div>' +
            '<span class="pill ' + (b.estado === 'pendiente' ? 'warn' : '') + '">' + escapeHtml(b.estado) + '</span>' +
          '</div>' +
          '<div style="margin-top:8px"><strong>Motivo:</strong> <span class="muted">' + escapeHtml(b.motivo || '(sin motivo)') + '</span></div>' +
          '<div class="form-grid" style="margin-top:12px">' +
            '<div class="field-full checkbox-row">' +
              '<input type="checkbox" id="llamada_' + b.id + '" ' + (b.llamada_realizada ? 'checked' : '') + '>' +
              '<label for="llamada_' + b.id + '">Llamada de seguimiento realizada</label>' +
            '</div>' +
            '<div class="field-full">' +
              '<label>Notas internas</label>' +
              '<textarea id="notas_' + b.id + '" rows="2">' + escapeHtml(b.notas_admin || '') + '</textarea>' +
            '</div>' +
          '</div>' +
          '<div class="actions" style="margin-top:12px">' +
            '<button class="btn btn-secondary" type="button" data-baja-save="' + b.id + '">Guardar notas</button>' +
            '<button class="btn btn-danger" type="button" data-baja-reject="' + b.id + '">Rechazar baja</button>' +
            '<button class="btn btn-primary" type="button" data-baja-approve="' + b.id + '">Aprobar baja</button>' +
          '</div>' +
        '</article>';
      }).join('');

      function gestionar(id, accion) {
        return request('/api/admin/bajas/' + id + '/gestionar', {
          method: 'POST',
          body: JSON.stringify({
            accion: accion,
            notas_admin: ($('notas_' + id) || {}).value,
            llamada_realizada: ($('llamada_' + id) || {}).checked
          })
        });
      }

      Array.from(document.querySelectorAll('[data-baja-save]')).forEach(function (b) {
        b.addEventListener('click', async function () {
          try { await gestionar(b.dataset.bajaSave, 'guardar_notas'); setMessage($('bajasMessage'), true, 'Notas guardadas.'); } catch (e) { setMessage($('bajasMessage'), false, e.message); }
        });
      });
      Array.from(document.querySelectorAll('[data-baja-approve]')).forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!window.confirm('¿Aprobar la baja del socio?')) return;
          try { await gestionar(b.dataset.bajaApprove, 'aprobar'); await loadBajas(); setMessage($('bajasMessage'), true, 'Baja aprobada.'); } catch (e) { setMessage($('bajasMessage'), false, e.message); }
        });
      });
      Array.from(document.querySelectorAll('[data-baja-reject]')).forEach(function (b) {
        b.addEventListener('click', async function () {
          try { await gestionar(b.dataset.bajaReject, 'rechazar'); await loadBajas(); setMessage($('bajasMessage'), true, 'Baja rechazada.'); } catch (e) { setMessage($('bajasMessage'), false, e.message); }
        });
      });
    } catch (err) {
      setMessage($('bajasMessage'), false, err.message);
    }
  }

  // =============================================================
  // ==================== IMPORTACIÓN CSV ========================
  // =============================================================
  $('csvInput').addEventListener('change', async function () {
    if (!$('csvInput').files || !$('csvInput').files[0]) return;
    const fd = new FormData();
    fd.append('archivo', $('csvInput').files[0]);
    setMessage($('importMessage'), true, 'Procesando CSV...');
    try {
      const res = await fetch('/api/admin/socios/importar', { method: 'POST', credentials: 'same-origin', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error importando CSV');
      renderCSVPreview(data);
      setMessage($('importMessage'), true, 'CSV procesado. ' + data.total + ' filas analizadas.');
    } catch (err) {
      setMessage($('importMessage'), false, err.message);
    }
  });

  function renderCSVPreview(data) {
    const filas = data.filas || [];
    $('csvPreviewArea').style.display = '';
    const tbody = document.querySelector('#csvTable tbody');
    tbody.innerHTML = filas.map(function (f) {
      const checkboxDisabled = f.estado !== 'pendiente' ? 'disabled' : '';
      return '<tr class="' + (f.estado === 'duplicado' ? 'selected' : '') + '">' +
        '<td><input type="checkbox" class="csv-check" data-id="' + f.id + '" ' + checkboxDisabled + '></td>' +
        '<td>' + escapeHtml(f.email || '') + '</td>' +
        '<td>' + escapeHtml((f.nombre || '') + ' ' + (f.apellidos || '')) + '</td>' +
        '<td>' + escapeHtml(f.entidad || '') + '</td>' +
        '<td>' + escapeHtml(f.provincia || '') + '</td>' +
        '<td>' + escapeHtml(f.rol_cluster || '') + '</td>' +
        '<td>' + escapeHtml(f.estado) + (f.errores ? ' <span class="muted" title="' + escapeHtml(typeof f.errores === 'string' ? f.errores : JSON.stringify(f.errores)) + '">⚠</span>' : '') + '</td>' +
      '</tr>';
    }).join('');

    const dup = filas.filter(function (f) { return f.estado === 'duplicado'; }).length;
    $('csvStats').textContent = filas.length + ' filas · ' + dup + ' duplicados detectados';

    $('csvSelectAll').addEventListener('change', function () {
      Array.from(document.querySelectorAll('.csv-check:not(:disabled)')).forEach(function (cb) {
        cb.checked = $('csvSelectAll').checked;
      });
    });
  }

  $('approveInvitedBtn').addEventListener('click', async function () {
    const ids = Array.from(document.querySelectorAll('.csv-check:checked')).map(function (cb) { return cb.dataset.id; });
    if (!ids.length) { setMessage($('importMessage'), false, 'No has seleccionado ninguna fila.'); return; }
    if (!window.confirm('¿Crear ' + ids.length + ' accesos y enviar email de bienvenida?')) return;

    let ok = 0, fail = 0;
    for (const id of ids) {
      try { await request('/api/admin/socios/invitados/' + id + '/aprobar', { method: 'POST', body: JSON.stringify({}) }); ok++; }
      catch (e) { fail++; console.warn(e); }
    }
    setMessage($('importMessage'), fail === 0, 'Procesados ' + ok + ' de ' + ids.length + (fail ? ' (' + fail + ' errores)' : ''));
    // Tras aprobar, refrescamos accesos
    window._accLoaded = false;
  });

  // =============================================================
  requireSession('admin').then(function (session) {
    // Normaliza el nombre del admin para corregir variantes tipográficas
    // ("AGSport" → "AGESPORT") que pudieran venir de la BD.
    $('adminWelcome').textContent = 'Hola, ' + normalizeBrand(session.user.nombre || 'Gerencia AGESPORT');
    loadDashboard();
  }).catch(function () {});
})();
