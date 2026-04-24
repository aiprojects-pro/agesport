(function () {
  const { logout, request, escapeHtml } = window.AgesportPortal;
  const metricsNode = document.getElementById('metrics');
  const pendingBody = document.getElementById('pendingBody');
  const pendingEmpty = document.getElementById('pendingEmpty');
  const pendingCount = document.getElementById('pendingCount');
  const activityBody = document.getElementById('activityBody');
  const activityEmpty = document.getElementById('activityEmpty');
  const adminName = document.getElementById('adminName');
  const adminMeta = document.getElementById('adminMeta');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const flashMessage = document.getElementById('flashMessage');

  const metricDefs = [
    ['socios_activos', 'Socios activos', 'Perfiles aprobados y activos'],
    ['socios_pendientes', 'Pendientes', 'Solicitudes por revisar'],
    ['mensajes_ultimo_mes', 'Mensajes 30d', 'Actividad de mensajería reciente'],
    ['conversaciones_activas', 'Conversaciones', 'Hilos activos en el último mes']
  ];

  async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Error en ' + url);
    }
    return data;
  }

  function setFlash(ok, text) {
    flashMessage.className = 'flash ' + (ok ? 'ok' : 'error');
    flashMessage.textContent = text;
  }

  async function updateSocioStatus(id, action, payload) {
    await request('/api/admin/socios/' + id + '/' + action, {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  }

  function renderMetrics(stats) {
    metricsNode.innerHTML = metricDefs.map(function (item) {
      const key = item[0];
      const label = item[1];
      const desc = item[2];
      return (
        '<article class="metric">' +
          '<small>' + label + '</small>' +
          '<strong>' + escapeHtml(stats[key] || '0') + '</strong>' +
          '<span>' + desc + '</span>' +
        '</article>'
      );
    }).join('');
  }

  function renderPending(socios) {
    pendingBody.innerHTML = '';
    if (!socios.length) {
      pendingEmpty.style.display = 'block';
      pendingCount.textContent = '0 pendientes';
      return;
    }
    pendingEmpty.style.display = 'none';
    pendingCount.textContent = socios.length + ' pendientes';
    pendingBody.innerHTML = socios.map(function (socio) {
      return (
        '<tr>' +
          '<td><strong>' + escapeHtml(socio.nombre + ' ' + socio.apellidos) + '</strong><br><span>' + escapeHtml(socio.email) + '</span></td>' +
          '<td>' + escapeHtml(socio.provincia || '-') + '</td>' +
          '<td>' + escapeHtml(socio.entidad || '-') + '</td>' +
          '<td>' + escapeHtml((socio.fecha_registro || '').slice(0, 10) || '-') + '</td>' +
          '<td><div class="actions">' +
            '<button class="btn btn-secondary js-approve" type="button" data-id="' + escapeHtml(socio.id) + '" data-name="' + escapeHtml(socio.nombre + ' ' + socio.apellidos) + '">Aprobar</button>' +
            '<button class="btn btn-danger js-reject" type="button" data-id="' + escapeHtml(socio.id) + '" data-name="' + escapeHtml(socio.nombre + ' ' + socio.apellidos) + '">Rechazar</button>' +
          '</div></td>' +
        '</tr>'
      );
    }).join('');

    Array.from(document.querySelectorAll('.js-approve')).forEach(function (button) {
      button.addEventListener('click', async function () {
        button.disabled = true;
        try {
          await updateSocioStatus(button.dataset.id, 'aprobar', { notas: 'Alta validada desde administración' });
          setFlash(true, button.dataset.name + ' se ha aprobado correctamente.');
          await loadDashboard();
        } catch (error) {
          setFlash(false, error.message);
        } finally {
          button.disabled = false;
        }
      });
    });

    Array.from(document.querySelectorAll('.js-reject')).forEach(function (button) {
      button.addEventListener('click', async function () {
        button.disabled = true;
        try {
          await updateSocioStatus(button.dataset.id, 'rechazar', {
            motivo: 'Solicitud pendiente de revisión documental',
            notas: 'Se requiere información adicional antes de continuar.'
          });
          setFlash(true, button.dataset.name + ' se ha marcado como no admitido.');
          await loadDashboard();
        } catch (error) {
          setFlash(false, error.message);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function renderActivity(rows) {
    activityBody.innerHTML = '';
    if (!rows.length) {
      activityEmpty.style.display = 'block';
      return;
    }
    activityEmpty.style.display = 'none';
    activityBody.innerHTML = rows.slice(0, 10).map(function (row) {
      return (
        '<tr>' +
          '<td>' + escapeHtml((row.fecha || '').slice(0, 10)) + '</td>' +
          '<td><strong>' + escapeHtml(row.accion) + '</strong></td>' +
          '<td>' + escapeHtml(row.total) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  async function loadDashboard() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Actualizando...';
    try {
      const session = await getJson('/api/auth/verify');
      if (session.type !== 'admin') {
        window.location.href = '/';
        return;
      }

      adminName.textContent = session.user.nombre;
      adminMeta.textContent = session.user.email + ' · ' + session.user.rol;

      const stats = await getJson('/api/admin/estadisticas');
      const pending = await getJson('/api/admin/socios/pendientes');

      renderMetrics(stats.stats || {});
      renderPending(pending.socios || []);
      renderActivity(stats.actividad_reciente || []);
    } catch (error) {
      adminName.textContent = 'Sesión no disponible';
      adminMeta.textContent = error.message;
      metricsNode.innerHTML = '<article class="metric"><small>Error</small><strong>--</strong><span>No se han podido cargar los datos del panel.</span></article>';
      pendingEmpty.style.display = 'block';
      activityEmpty.style.display = 'block';
      if (/No autenticado|Token|Acceso denegado|401/.test(error.message)) {
        window.setTimeout(function () {
          window.location.href = '/';
        }, 1200);
      }
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Actualizar datos';
    }
  }

  logoutBtn.addEventListener('click', logout);
  refreshBtn.addEventListener('click', loadDashboard);
  loadDashboard();
})();
