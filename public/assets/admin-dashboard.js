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
    if (which === 'correo' && !window._smtpLoaded) loadSmtpConfig();
    if (which === 'usuarios' && !window._usuariosLoaded) { loadAdmins(); loadSociosAdvanced(); }
    if (which === 'emails' && !window._emailsLoaded) loadEmailTemplates();
    if (which === 'comunicaciones' && !window._comLoaded) initComunicaciones();
    if (which === 'auditoria' && !window._auditLoaded) loadAuditoria();
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
      tp.innerHTML = (data.provincias_mas_activas || []).slice(0, 6).map(function (p) {
        return '<li>' + escapeHtml(p.provincia || '-') + ' — ' + escapeHtml(p.total || 0) + ' socios</li>';
      }).join('') || '<li>Sin datos</li>';

      const te = $('topEspecialidades');
      const topEsp = data.top_especialidades || [];
      te.innerHTML = topEsp.slice(0, 6).map(function (e) {
        const esp = cat.findEspecialidadBySlug(e.especialidad);
        return '<li>' + escapeHtml(esp ? esp.label : e.especialidad) + ' — ' + escapeHtml(e.total || 0) + '</li>';
      }).join('') || '<li>Sin datos</li>';

      const act = $('actividadReciente');
      const acciones = (data.actividad_reciente || []).slice(0, 12);
      act.innerHTML = acciones.length
        ? '<ul style="margin:0;padding-left:18px">' + acciones.map(function (a) {
            return '<li>' + escapeHtml(a.accion || '') + ' · ' + escapeHtml(a.total || 0) + ' acciones · ' + escapeHtml(formatDate(a.fecha)) + '</li>';
          }).join('') + '</ul>'
        : 'Sin actividad reciente registrada.';

      // Gráfico de evolución mensual del clúster (12 meses)
      loadAltasMensuales();
    } catch (err) {
      $('adminKpis').innerHTML = '<div class="empty">No se pudieron cargar las estadísticas: ' + escapeHtml(err.message) + '</div>';
    }
  }

  // Renderiza un gráfico de barras SVG con las altas mensuales. Sin librerías
  // externas: SVG puro, responsive vía viewBox. Muestra el valor sobre cada
  // barra si es > 0.
  async function loadAltasMensuales() {
    try {
      const data = await request('/api/admin/stats/altas-mensuales', { method: 'GET', headers: {} });
      $('altasTotal').textContent = data.total_12m + ' altas en total';
      const meses = data.meses || [];
      if (!meses.length) {
        $('altasChart').innerHTML = '<p class="muted">Aún no hay datos suficientes.</p>';
        return;
      }
      const maxVal = Math.max(1, ...meses.map(function (m) { return m.altas; }));
      const W = 720, H = 220, padL = 32, padR = 12, padT = 18, padB = 40;
      const cw = (W - padL - padR) / meses.length;
      const bh = H - padT - padB;
      const bars = meses.map(function (m, i) {
        const h = (m.altas / maxVal) * bh;
        const x = padL + i * cw + cw * 0.15;
        const y = padT + (bh - h);
        const w = cw * 0.7;
        const val = m.altas > 0
          ? '<text x="' + (x + w / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="11" fill="#0d355f" font-weight="700">' + m.altas + '</text>'
          : '';
        return (
          '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" ' +
            'fill="#0f895b" rx="4"><title>' + m.label + ': ' + m.altas + ' altas</title></rect>' +
          val +
          '<text x="' + (x + w / 2) + '" y="' + (H - padB + 16) + '" text-anchor="middle" ' +
            'font-size="10" fill="#64748b">' + escapeHtml(m.label) + '</text>'
        );
      }).join('');
      // Líneas de guía horizontales
      const grid = [0.25, 0.5, 0.75, 1].map(function (p) {
        const y = padT + bh * (1 - p);
        return '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" ' +
               'stroke="#e2e8f0" stroke-width="1"/>' +
               '<text x="' + (padL - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="#94a3b8">' +
                  Math.round(maxVal * p) + '</text>';
      }).join('');
      $('altasChart').innerHTML =
        '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:100%;height:auto">' +
          grid + bars +
        '</svg>';
    } catch (err) {
      $('altasChart').innerHTML = '<p class="muted">No se pudo cargar el gráfico: ' + escapeHtml(err.message) + '</p>';
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

  // Parsea el JSON del campo `errores` (viene como string desde la BD)
  function parseErrores(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : [String(raw)]; }
    catch (_) { return [String(raw)]; }
  }

  window._csvFilas = [];
  function renderCSVPreview(data) {
    const filas = data.filas || window._csvFilas || [];
    window._csvFilas = filas;
    $('csvPreviewArea').style.display = '';
    const tbody = document.querySelector('#csvTable tbody');
    tbody.innerHTML = filas.map(renderCSVRow).join('');
    const dup = filas.filter(function (f) { return f.estado === 'duplicado'; }).length;
    const err = filas.filter(function (f) { return f.estado === 'con_errores'; }).length;
    $('csvStats').textContent = filas.length + ' filas · ' + dup + ' duplicados · ' + err + ' con errores';
  }

  function renderCSVRow(f) {
    const checkboxDisabled = f.estado !== 'pendiente' ? 'disabled' : '';
    const errores = parseErrores(f.errores);
    const errBadge = f.estado === 'con_errores'
      ? '<span class="tag" style="background:rgba(180,80,80,.12);color:#8a2020">con errores</span>'
      : (f.estado === 'duplicado'
          ? '<span class="tag" style="background:rgba(217,119,6,.15);color:#8a4d0a">duplicado</span>'
          : '<span class="tag">' + escapeHtml(f.estado) + '</span>');
    const puedeEditar = f.estado === 'con_errores' || f.estado === 'duplicado';
    return '<tr data-fila-id="' + f.id + '" class="' + (f.estado === 'duplicado' ? 'selected' : '') + '">' +
      '<td><input type="checkbox" class="csv-check" data-id="' + f.id + '" ' + checkboxDisabled + '></td>' +
      '<td>' + escapeHtml(f.email || '') + '</td>' +
      '<td>' + escapeHtml((f.nombre || '') + ' ' + (f.apellidos || '')) + '</td>' +
      '<td>' + escapeHtml(f.entidad || '') + '</td>' +
      '<td>' + escapeHtml(f.provincia || '') + '</td>' +
      '<td>' + escapeHtml(f.rol_cluster || '') + '</td>' +
      '<td>' + errBadge +
        (errores.length ? '<div style="color:#8a2020;font-size:.78rem;margin-top:4px">' + errores.map(escapeHtml).join('<br>') + '</div>' : '') +
      '</td>' +
      '<td>' + (puedeEditar
        ? '<button class="btn btn-secondary btn-sm" data-action="csv-edit" data-id="' + f.id + '">Corregir</button>'
        : '') + '</td>' +
    '</tr>';
  }

  // Delegación: abrir el editor inline
  document.addEventListener('click', function (ev) {
    const btn = ev.target.closest('#csvTable button[data-action="csv-edit"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const f = (window._csvFilas || []).find(function (x) { return String(x.id) === String(id); });
    if (!f) return;
    openCsvEditor(f);
  });

  function openCsvEditor(f) {
    const cat = window.AgesportCatalogos;
    const provinces = cat.COMUNIDADES_AUTONOMAS.flatMap(function (c) { return c.provincias; }).sort();
    const provOpts = ['<option value="">— sin provincia —</option>']
      .concat(provinces.map(function (p) { return '<option value="' + escapeHtml(p) + '"' + ((f.provincia === p) ? ' selected' : '') + '>' + escapeHtml(p) + '</option>'; })).join('');
    const rolOpts = ['<option value="">— sin rol —</option>']
      .concat(cat.ROLES_CLUSTER.map(function (r) { return '<option value="' + r.slug + '"' + (f.rol_cluster === r.slug ? ' selected' : '') + '>' + escapeHtml(r.label) + '</option>'; })).join('');
    const tipoOpts = cat.TIPOS_SOCIO.map(function (t) { return '<option value="' + t.slug + '"' + ((f.tipo_socio || 'numero') === t.slug ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>'; }).join('');

    const editor = document.createElement('tr');
    editor.className = 'csv-editor';
    editor.dataset.editorFor = f.id;
    editor.innerHTML =
      '<td colspan="8" style="background:var(--bg-soft);padding:14px">' +
        '<div class="form-grid" style="gap:10px">' +
          '<div class="field"><label>Nombre</label><input class="ed-nombre" value="' + escapeHtml(f.nombre || '') + '"></div>' +
          '<div class="field"><label>Apellidos</label><input class="ed-apellidos" value="' + escapeHtml(f.apellidos || '') + '"></div>' +
          '<div class="field"><label>Email</label><input class="ed-email" type="email" value="' + escapeHtml(f.email || '') + '"></div>' +
          '<div class="field"><label>Entidad</label><input class="ed-entidad" value="' + escapeHtml(f.entidad || '') + '"></div>' +
          '<div class="field"><label>Cargo</label><input class="ed-cargo" value="' + escapeHtml(f.cargo_actual || '') + '"></div>' +
          '<div class="field"><label>Provincia</label><select class="ed-provincia">' + provOpts + '</select></div>' +
          '<div class="field"><label>Localidad</label><input class="ed-localidad" value="' + escapeHtml(f.localidad || '') + '"></div>' +
          '<div class="field"><label>Rol clúster</label><select class="ed-rol">' + rolOpts + '</select></div>' +
          '<div class="field"><label>Tipo de socio</label><select class="ed-tipo">' + tipoOpts + '</select></div>' +
        '</div>' +
        '<div class="actions" style="margin-top:12px">' +
          '<button class="btn btn-secondary" data-action="csv-cancel">Cancelar</button> ' +
          '<button class="btn btn-primary" data-action="csv-save" data-id="' + f.id + '">Guardar y revalidar</button>' +
        '</div>' +
      '</td>';
    // Insertar debajo de la fila
    const row = document.querySelector('#csvTable tr[data-fila-id="' + f.id + '"]');
    if (!row) return;
    // Si ya hay editor abierto, cerrarlo
    const prev = document.querySelector('#csvTable .csv-editor');
    if (prev) prev.remove();
    row.parentNode.insertBefore(editor, row.nextSibling);
  }

  document.addEventListener('click', async function (ev) {
    if (ev.target.matches('#csvTable button[data-action="csv-cancel"]')) {
      const editor = ev.target.closest('.csv-editor');
      if (editor) editor.remove();
      return;
    }
    const saveBtn = ev.target.closest('#csvTable button[data-action="csv-save"]');
    if (!saveBtn) return;
    const id = saveBtn.dataset.id;
    const editor = saveBtn.closest('.csv-editor');
    const body = {
      nombre: editor.querySelector('.ed-nombre').value,
      apellidos: editor.querySelector('.ed-apellidos').value,
      email: editor.querySelector('.ed-email').value,
      entidad: editor.querySelector('.ed-entidad').value,
      cargo_actual: editor.querySelector('.ed-cargo').value,
      provincia: editor.querySelector('.ed-provincia').value,
      localidad: editor.querySelector('.ed-localidad').value,
      rol_cluster: editor.querySelector('.ed-rol').value,
      tipo_socio: editor.querySelector('.ed-tipo').value,
    };
    try {
      const res = await request('/api/admin/socios/invitados/' + id, {
        method: 'PUT', body: JSON.stringify(body),
      });
      setMessage($('importMessage'), true, res.message);
      // Actualizar la fila en la memoria y repintar
      window._csvFilas = window._csvFilas.map(function (x) { return String(x.id) === String(id) ? res.fila : x; });
      editor.remove();
      const row = document.querySelector('#csvTable tr[data-fila-id="' + id + '"]');
      if (row) row.outerHTML = renderCSVRow(res.fila);
    } catch (err) {
      setMessage($('importMessage'), false, err.message);
    }
  });

  // Listener "seleccionar todo" — se registra UNA sola vez al cargar la
  // página (antes se re-registraba con cada preview y acumulaba handlers
  // fantasma que confundían el estado).
  $('csvSelectAll').addEventListener('change', function () {
    Array.from(document.querySelectorAll('.csv-check:not(:disabled)')).forEach(function (cb) {
      cb.checked = $('csvSelectAll').checked;
    });
  });

  $('approveInvitedBtn').addEventListener('click', async function () {
    const ids = Array.from(document.querySelectorAll('.csv-check:checked')).map(function (cb) { return cb.dataset.id; });
    if (!ids.length) { setMessage($('importMessage'), false, 'No has seleccionado ninguna fila.'); return; }
    if (!window.confirm('¿Crear ' + ids.length + ' accesos y enviar email de bienvenida?')) return;

    $('approveInvitedBtn').disabled = true;
    let ok = 0, fail = 0;
    const errores = [];
    for (const id of ids) {
      try {
        await request('/api/admin/socios/invitados/' + id + '/aprobar', { method: 'POST', body: JSON.stringify({}) });
        ok++;
        window._csvFilas = window._csvFilas.map(function (f) {
          return String(f.id) === String(id) ? Object.assign({}, f, { estado: 'aprobado' }) : f;
        });
        const fila = window._csvFilas.find(function (f) { return String(f.id) === String(id); });
        const row = document.querySelector('#csvTable tr[data-fila-id="' + id + '"]');
        if (row && fila) row.outerHTML = renderCSVRow(fila);
      }
      catch (e) { fail++; errores.push('Fila ' + id + ': ' + e.message); }
    }
    $('approveInvitedBtn').disabled = false;
    $('csvSelectAll').checked = false;
    setMessage($('importMessage'), fail === 0, 'Procesados ' + ok + ' de ' + ids.length + (fail ? '. ' + errores.join('; ') : ''));
    // Tras aprobar, refrescamos accesos
    window._accLoaded = false;
  });

  // =============================================================
  // ==================== CORREO SALIENTE (SMTP) =================
  // =============================================================
  async function loadSmtpConfig() {
    try {
      const data = await request('/api/admin/config/smtp', { method: 'GET', headers: {} });
      const cfg = data.config || {};
      $('smtp_host').value      = cfg.host || '';
      $('smtp_port').value      = cfg.port || 587;
      $('smtp_secure').checked  = !!cfg.secure;
      $('smtp_user').value      = cfg.user || '';
      $('smtp_from_name').value = cfg.fromName || 'AGESPORT · Mapa del Talento';
      $('smtp_from_email').value = cfg.fromEmail || '';
      $('smtp_reply_to').value  = cfg.replyTo || '';
      $('smtp_pass').placeholder = cfg.passwordSet
        ? '••••••••  (deja en blanco para no cambiarla)'
        : 'Contraseña / App password';
      window._smtpLoaded = true;
    } catch (err) {
      setMessage($('smtpMessage'), false, err.message);
    }
  }

  function readSmtpForm() {
    return {
      host: $('smtp_host').value.trim(),
      port: parseInt($('smtp_port').value) || 587,
      secure: $('smtp_secure').checked,
      user: $('smtp_user').value.trim(),
      pass: $('smtp_pass').value,
      fromName: $('smtp_from_name').value.trim(),
      fromEmail: $('smtp_from_email').value.trim(),
      replyTo: $('smtp_reply_to').value.trim() || null,
    };
  }

  const smtpForm = $('smtpForm');
  if (smtpForm) {
    smtpForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const btn = $('smtpSaveBtn');
      btn.disabled = true; btn.textContent = 'Guardando...';
      try {
        const body = readSmtpForm();
        const data = await request('/api/admin/config/smtp', {
          method: 'POST', body: JSON.stringify(body),
        });
        setMessage($('smtpMessage'), true, data.message);
        $('smtp_pass').value = '';
        window._smtpLoaded = false;
        loadSmtpConfig();
      } catch (err) {
        setMessage($('smtpMessage'), false, err.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Guardar configuración';
      }
    });

    $('smtpTestBtn').addEventListener('click', async function () {
      const to = $('smtp_test_email').value.trim();
      if (!to) { setMessage($('smtpMessage'), false, 'Indica el email destinatario de la prueba.'); return; }
      const btn = $('smtpTestBtn');
      btn.disabled = true; btn.textContent = 'Enviando prueba...';
      try {
        const body = Object.assign(readSmtpForm(), { to });
        const data = await request('/api/admin/config/smtp/test', {
          method: 'POST', body: JSON.stringify(body),
        });
        setMessage($('smtpMessage'), true, data.message);
      } catch (err) {
        setMessage($('smtpMessage'), false, err.message);
      } finally {
        btn.disabled = false; btn.textContent = 'Enviar email de prueba';
      }
    });
  }

  // =============================================================
  // ==================== COMUNICACIONES MASIVAS =================
  // =============================================================
  function initComunicaciones() {
    const cat = window.AgesportCatalogos;
    const provSel = $('comProvincia');
    const rolSel = $('comRol');
    if (!provSel.options.length || provSel.options.length === 1) {
      cat.COMUNIDADES_AUTONOMAS.flatMap(function (c) { return c.provincias; }).sort()
        .forEach(function (p) {
          const opt = document.createElement('option');
          opt.value = p; opt.textContent = p;
          provSel.appendChild(opt);
        });
    }
    if (!rolSel.options.length || rolSel.options.length === 1) {
      cat.ROLES_CLUSTER.forEach(function (r) {
        const opt = document.createElement('option');
        opt.value = r.slug; opt.textContent = r.label;
        rolSel.appendChild(opt);
      });
    }
    window._comLoaded = true;
  }
  function readComFilters() {
    return {
      provincia: $('comProvincia').value || null,
      rol_cluster: $('comRol').value || null,
      disponibilidad: $('comDisponibilidad').value || null,
      ambito: $('comAmbito').value || null,
      solo_mentores: $('comSoloMentores').checked,
    };
  }
  const comPreviewBtn = $('comPreviewBtn');
  if (comPreviewBtn) {
    comPreviewBtn.addEventListener('click', async function () {
      comPreviewBtn.disabled = true;
      try {
        const r = await request('/api/admin/comunicaciones/preview', {
          method: 'POST', body: JSON.stringify(readComFilters()),
        });
        $('comPreviewResult').textContent = 'Se enviará a ' + r.destinatarios + ' socio(s).';
      } catch (e) { setMessage($('comMessage'), false, e.message); }
      finally { comPreviewBtn.disabled = false; }
    });
  }
  const comForm = $('comForm');
  if (comForm) {
    comForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      const asunto = $('comAsunto').value.trim();
      const cuerpo = $('comCuerpo').value.trim();
      if (asunto.length < 3 || cuerpo.length < 10) {
        setMessage($('comMessage'), false, 'Asunto y cuerpo son obligatorios.');
        return;
      }
      const filtros = readComFilters();
      // Confirmar destinatarios
      try {
        const pv = await request('/api/admin/comunicaciones/preview', {
          method: 'POST', body: JSON.stringify(filtros),
        });
        if (!window.confirm('Se enviará el email a ' + pv.destinatarios + ' socio(s). ¿Continuar?')) return;
      } catch (e) { setMessage($('comMessage'), false, e.message); return; }
      const btn = $('comSendBtn');
      btn.disabled = true; btn.textContent = 'Encolando...';
      try {
        const r = await request('/api/admin/comunicaciones/enviar', {
          method: 'POST', body: JSON.stringify({ asunto, cuerpo, filtros }),
        });
        setMessage($('comMessage'), true,
          r.message + ' · ' + r.destinatarios + ' destinatarios · envío en curso');
      } catch (e) { setMessage($('comMessage'), false, e.message); }
      finally { btn.disabled = false; btn.textContent = 'Enviar comunicación'; }
    });
  }

  // =============================================================
  // ==================== AUDITORÍA / ACTIVIDAD ==================
  // =============================================================
  let auditPage = 1;
  const auditLimit = 50;

  async function loadAuditoria(page) {
    auditPage = page || 1;
    const q = new URLSearchParams();
    if ($('auditAccion').value) q.set('accion', $('auditAccion').value);
    if ($('auditDesde').value)  q.set('desde',  $('auditDesde').value);
    if ($('auditHasta').value)  q.set('hasta',  $('auditHasta').value + ' 23:59:59');
    q.set('page', auditPage); q.set('limit', auditLimit);
    try {
      const data = await request('/api/admin/auditoria?' + q.toString(), { method: 'GET', headers: {} });
      const sel = $('auditAccion');
      if (sel.options.length <= 1) {
        (data.acciones || []).forEach(function (a) {
          const opt = document.createElement('option');
          opt.value = a; opt.textContent = a;
          sel.appendChild(opt);
        });
      }
      const tbody = document.querySelector('#auditTable tbody');
      const entradas = data.auditoria || data.entradas || [];
      tbody.innerHTML = entradas.map(function (e) {
        const quien = e.admin_nombre ? ('admin: ' + e.admin_nombre)
                    : (e.socio_nombre ? ('socio: ' + e.socio_nombre + ' ' + (e.socio_apellidos || '')) : '—');
        return '<tr>' +
          '<td class="muted">' + fmtDate(e.created_at) + '</td>' +
          '<td><code style="font-size:.8rem">' + escapeHtml(e.accion) + '</code></td>' +
          '<td>' + escapeHtml(e.recurso || '') + '</td>' +
          '<td>' + escapeHtml(quien) + '</td>' +
          '<td class="muted" style="font-size:.8rem">' + escapeHtml(e.ip_address || '') + '</td>' +
        '</tr>';
      }).join('');
      const totalPages = Math.max(1, Math.ceil(data.total / auditLimit));
      $('auditPagination').innerHTML =
        'Página ' + auditPage + ' de ' + totalPages + ' · ' + data.total + ' entradas · ' +
        (auditPage > 1 ? '<a href="#" data-audit-page="' + (auditPage - 1) + '">anterior</a> · ' : '') +
        (auditPage < totalPages ? '<a href="#" data-audit-page="' + (auditPage + 1) + '">siguiente</a>' : '');
      window._auditLoaded = true;
    } catch (e) { setMessage($('auditMessage'), false, e.message); }
  }
  const auditApplyBtn = $('auditApplyBtn');
  if (auditApplyBtn) {
    auditApplyBtn.addEventListener('click', function () { loadAuditoria(1); });
    $('auditResetBtn').addEventListener('click', function () {
      $('auditAccion').value = ''; $('auditDesde').value = ''; $('auditHasta').value = '';
      loadAuditoria(1);
    });
    document.addEventListener('click', function (ev) {
      const link = ev.target.closest('[data-audit-page]');
      if (!link) return;
      ev.preventDefault();
      loadAuditoria(parseInt(link.dataset.auditPage));
    });
    $('auditExportBtn').addEventListener('click', function () {
      const q = new URLSearchParams();
      if ($('auditAccion').value) q.set('accion', $('auditAccion').value);
      if ($('auditDesde').value)  q.set('desde',  $('auditDesde').value);
      if ($('auditHasta').value)  q.set('hasta',  $('auditHasta').value + ' 23:59:59');
      // Descarga vía window.open para respetar la cookie de sesión
      const url = '/api/admin/auditoria/exportar' + (q.toString() ? '?' + q.toString() : '');
      window.location.href = url;
    });
  }

  // =============================================================
  // ==================== PLANTILLAS EMAIL =======================
  // =============================================================
  const EMAIL_TEMPLATE_META = {
    'email.welcome.subject':    { grupo: 'Bienvenida',   label: 'Asunto del email' },
    'email.welcome.heading':    { grupo: 'Bienvenida',   label: 'Encabezado' },
    'email.welcome.greeting':   { grupo: 'Bienvenida',   label: 'Saludo (usa {nombre})' },
    'email.welcome.intro':      { grupo: 'Bienvenida',   label: 'Texto introductorio', multiline: true },
    'email.welcome.list_intro': { grupo: 'Bienvenida',   label: 'Frase antes de la lista' },
    'email.welcome.list_items': { grupo: 'Bienvenida',   label: 'Ítems de la lista (uno por línea, separados por "|")', multiline: true, hint: 'Ej: Explorar el directorio|Contactar con socios|…' },
    'email.welcome.cta':        { grupo: 'Bienvenida',   label: 'Texto del botón de acceso' },
    'email.welcome.outro':      { grupo: 'Bienvenida',   label: 'Despedida', multiline: true },
    'email.welcome.signature':  { grupo: 'Bienvenida',   label: 'Firma final' },
  };

  async function loadEmailTemplates() {
    try {
      const data = await request('/api/admin/landing?prefix=email.', { method: 'GET', headers: {} });
      const items = (data.content || []).filter(function (x) { return String(x.clave).startsWith('email.'); });
      renderEmailTemplates(items);
      window._emailsLoaded = true;
    } catch (err) {
      setMessage($('emailTemplatesMsg'), false, err.message);
    }
  }

  function renderEmailTemplates(items) {
    const byGroup = {};
    items.forEach(function (it) {
      const meta = EMAIL_TEMPLATE_META[it.clave] || { grupo: 'Otros', label: it.clave };
      byGroup[meta.grupo] = byGroup[meta.grupo] || [];
      byGroup[meta.grupo].push({ ...it, meta });
    });
    const container = $('emailTemplates');
    container.innerHTML = Object.keys(byGroup).map(function (grupo) {
      const cards = byGroup[grupo].map(function (it) {
        const id = 'et_' + it.clave.replace(/[^a-z0-9]/gi, '_');
        const val = escapeHtml(it.valor || '');
        const control = it.meta.multiline
          ? '<textarea id="' + id + '" rows="3" style="width:100%">' + val + '</textarea>'
          : '<input id="' + id + '" type="text" value="' + val + '" style="width:100%">';
        return '<div class="field" style="margin-bottom:14px">' +
          '<label for="' + id + '">' + escapeHtml(it.meta.label) + '</label>' +
          '<div class="muted" style="font-size:.75rem;margin-bottom:4px">' + escapeHtml(it.clave) +
            (it.meta.hint ? ' · ' + escapeHtml(it.meta.hint) : '') + '</div>' +
          control +
          '<div style="margin-top:6px">' +
            '<button class="btn btn-secondary btn-sm" data-action="et-save" data-clave="' + it.clave + '" data-target="' + id + '">Guardar</button>' +
          '</div>' +
        '</div>';
      }).join('');
      return '<article class="form-card" style="background:var(--bg-soft);margin-bottom:14px">' +
        '<h3 style="margin:0 0 12px">' + escapeHtml(grupo) + '</h3>' + cards +
      '</article>';
    }).join('');
  }

  document.addEventListener('click', async function (ev) {
    const btn = ev.target.closest('#emailTemplates button[data-action="et-save"]');
    if (!btn) return;
    const clave = btn.dataset.clave;
    const el = document.getElementById(btn.dataset.target);
    if (!el) return;
    try {
      await request('/api/admin/landing/' + encodeURIComponent(clave), {
        method: 'PUT', body: JSON.stringify({ valor: el.value }),
      });
      setMessage($('emailTemplatesMsg'), true, 'Guardado: ' + clave);
    } catch (err) {
      setMessage($('emailTemplatesMsg'), false, err.message);
    }
  });

  // =============================================================
  // ==================== USUARIOS Y ROLES =======================
  // =============================================================

  function fmtDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleString('es-ES', {dateStyle:'short', timeStyle:'short'}); }
    catch (_) { return '—'; }
  }

  // --- Administradores ---
  async function loadAdmins() {
    try {
      const data = await request('/api/admin/administradores', { method: 'GET', headers: {} });
      const admins = data.administradores || [];
      const tbody = document.querySelector('#adminsTable tbody');
      tbody.innerHTML = admins.map(function (a) {
        const rolBadge = a.rol === 'superadmin'
          ? '<span class="tag" style="background:rgba(15,137,91,.12);color:var(--green-deep)">Superadmin</span>'
          : '<span class="tag">Administrador</span>';
        const estadoBadge = a.activo
          ? '<span class="tag" style="background:rgba(15,137,91,.12);color:var(--green-deep)">Activo</span>'
          : '<span class="tag" style="background:rgba(180,80,80,.12);color:#8a2020">Inactivo</span>';
        return '<tr>' +
          '<td>' + escapeHtml(a.nombre || '') + '</td>' +
          '<td>' + escapeHtml(a.email || '') + '</td>' +
          '<td>' + rolBadge + '</td>' +
          '<td>' + estadoBadge + '</td>' +
          '<td class="muted">' + fmtDate(a.ultimo_acceso) + '</td>' +
          '<td>' +
            '<button class="btn btn-secondary btn-sm" data-action="toggle-rol" data-id="' + a.id + '" data-rol="' + a.rol + '">Cambiar rol</button> ' +
            '<button class="btn btn-secondary btn-sm" data-action="reset-pw" data-id="' + a.id + '" data-email="' + escapeHtml(a.email) + '">Reset password</button> ' +
            (a.activo
              ? '<button class="btn btn-secondary btn-sm" data-action="deactivate" data-id="' + a.id + '">Desactivar</button>'
              : '<button class="btn btn-secondary btn-sm" data-action="activate" data-id="' + a.id + '">Reactivar</button>') +
          '</td>' +
        '</tr>';
      }).join('');
      window._usuariosLoaded = true;
    } catch (err) {
      setMessage($('adminsMessage'), false, err.message);
    }
  }

  // Delegación de eventos en la tabla de admins
  document.addEventListener('click', async function (ev) {
    const btn = ev.target.closest('#adminsTable button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    try {
      if (action === 'toggle-rol') {
        const nuevoRol = btn.dataset.rol === 'superadmin' ? 'admin' : 'superadmin';
        if (!window.confirm('¿Cambiar rol a "' + nuevoRol + '"?')) return;
        await request('/api/admin/administradores/' + id, { method: 'PUT', body: JSON.stringify({rol: nuevoRol}) });
        setMessage($('adminsMessage'), true, 'Rol actualizado.');
        loadAdmins();
      } else if (action === 'reset-pw') {
        if (!window.confirm('Se enviará un email de restablecimiento a ' + btn.dataset.email + '. ¿Continuar?')) return;
        const r = await request('/api/admin/administradores/' + id + '/reset-password', { method: 'POST', body: JSON.stringify({}) });
        setMessage($('adminsMessage'), true, r.message);
      } else if (action === 'deactivate') {
        if (!window.confirm('¿Desactivar este administrador? No podrá volver a entrar hasta que lo reactives.')) return;
        await request('/api/admin/administradores/' + id, { method: 'DELETE', body: JSON.stringify({}) });
        setMessage($('adminsMessage'), true, 'Administrador desactivado.');
        loadAdmins();
      } else if (action === 'activate') {
        await request('/api/admin/administradores/' + id, { method: 'PUT', body: JSON.stringify({activo: true}) });
        setMessage($('adminsMessage'), true, 'Administrador reactivado.');
        loadAdmins();
      }
    } catch (err) {
      setMessage($('adminsMessage'), false, err.message);
    }
  });

  // Alta de admin
  const btnNuevoAdmin = $('btnNuevoAdmin');
  const formNuevoAdmin = $('nuevoAdminForm');
  if (btnNuevoAdmin) {
    btnNuevoAdmin.addEventListener('click', function () { formNuevoAdmin.style.display = ''; });
    $('cancelNuevoAdmin').addEventListener('click', function () { formNuevoAdmin.style.display = 'none'; });
    $('createAdminBtn').addEventListener('click', async function () {
      const body = {
        nombre: $('admNombre').value.trim(),
        email: $('admEmail').value.trim(),
        password: $('admPassword').value,
        rol: $('admRol').value,
      };
      try {
        const r = await request('/api/admin/administradores', { method: 'POST', body: JSON.stringify(body) });
        setMessage($('adminsMessage'), true, r.message);
        formNuevoAdmin.style.display = 'none';
        $('admNombre').value = ''; $('admEmail').value = ''; $('admPassword').value = ''; $('admRol').value = 'admin';
        loadAdmins();
      } catch (err) { setMessage($('adminsMessage'), false, err.message); }
    });
  }

  // --- Socios avanzado ---
  let sociosCache = [];
  async function loadSociosAdvanced() {
    try {
      const data = await request('/api/admin/socios?limit=500', { method: 'GET', headers: {} });
      sociosCache = data.socios || [];
      renderSociosAdv();
    } catch (err) { setMessage($('sociosAdvMessage'), false, err.message); }
  }
  function renderSociosAdv() {
    const q = ($('sociosBusqueda').value || '').toLowerCase().trim();
    const filtered = sociosCache.filter(function (s) {
      if (!q) return true;
      return (s.nombre || '').toLowerCase().includes(q) ||
             (s.apellidos || '').toLowerCase().includes(q) ||
             (s.email || '').toLowerCase().includes(q);
    });
    const tipos = window.AgesportCatalogos.TIPOS_SOCIO;
    const tbody = document.querySelector('#sociosAdvTable tbody');
    tbody.innerHTML = filtered.map(function (s) {
      const options = tipos.map(function (t) {
        return '<option value="' + t.slug + '"' + (s.tipo_socio === t.slug ? ' selected' : '') + '>' + escapeHtml(t.label) + '</option>';
      }).join('');
      return '<tr>' +
        '<td>' + escapeHtml((s.nombre || '') + ' ' + (s.apellidos || '')) + '</td>' +
        '<td class="muted">' + escapeHtml(s.email || '') + '</td>' +
        '<td><select class="socio-tipo" data-id="' + s.id + '">' + options + '</select></td>' +
        '<td><span class="tag">' + escapeHtml(s.estado || '') + '</span></td>' +
        '<td>' +
          '<button class="btn btn-secondary btn-sm" data-action="socio-reset-pw" data-id="' + s.id + '" data-email="' + escapeHtml(s.email) + '">Reset password</button> ' +
          (s.estado === 'aprobado' && s.activo
            ? '<button class="btn btn-secondary btn-sm" data-action="socio-resend-welcome" data-id="' + s.id + '" data-email="' + escapeHtml(s.email) + '">Reenviar bienvenida</button>'
            : '') +
        '</td>' +
      '</tr>';
    }).join('');
  }
  const busqueda = $('sociosBusqueda');
  if (busqueda) busqueda.addEventListener('input', renderSociosAdv);

  // Delegación de eventos socios avanzados
  document.addEventListener('change', async function (ev) {
    const sel = ev.target.closest('#sociosAdvTable .socio-tipo');
    if (!sel) return;
    const id = sel.dataset.id;
    try {
      const r = await request('/api/admin/socios/' + id + '/tipo', { method: 'PUT', body: JSON.stringify({tipo_socio: sel.value}) });
      setMessage($('sociosAdvMessage'), true, r.message);
    } catch (err) {
      setMessage($('sociosAdvMessage'), false, err.message);
      loadSociosAdvanced(); // revertir
    }
  });
  document.addEventListener('click', async function (ev) {
    const resetBtn = ev.target.closest('#sociosAdvTable button[data-action="socio-reset-pw"]');
    if (resetBtn) {
      if (!window.confirm('Se enviará un email de restablecimiento a ' + resetBtn.dataset.email + '. ¿Continuar?')) return;
      try {
        const r = await request('/api/admin/socios/' + resetBtn.dataset.id + '/reset-password', { method: 'POST', body: JSON.stringify({}) });
        setMessage($('sociosAdvMessage'), true, r.message);
      } catch (err) { setMessage($('sociosAdvMessage'), false, err.message); }
      return;
    }
    const resendBtn = ev.target.closest('#sociosAdvTable button[data-action="socio-resend-welcome"]');
    if (resendBtn) {
      if (!window.confirm('Se reenviará el email de bienvenida a ' + resendBtn.dataset.email + '. ¿Continuar?')) return;
      try {
        const r = await request('/api/admin/socios/' + resendBtn.dataset.id + '/reenviar-bienvenida', { method: 'POST', body: JSON.stringify({}) });
        setMessage($('sociosAdvMessage'), true, r.message);
      } catch (err) { setMessage($('sociosAdvMessage'), false, err.message); }
    }
  });

  // =============================================================
  requireSession('admin').then(function (session) {
    // Normaliza el nombre del admin para corregir variantes tipográficas
    // ("AGSport" → "AGESPORT") que pudieran venir de la BD.
    $('adminWelcome').textContent = 'Hola, ' + normalizeBrand(session.user.nombre || 'Gerencia AGESPORT');
    loadDashboard();
  }).catch(function () {});
})();
