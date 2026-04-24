(function () {
  const { requireSession, request, logout, escapeHtml } = window.AgesportPortal;
  const welcomeTitle = document.getElementById('welcomeTitle');
  const welcomeText = document.getElementById('welcomeText');
  const kpis = document.getElementById('kpis');
  const observatorioSummary = document.getElementById('observatorioSummary');
  const mensajeriaSummary = document.getElementById('mensajeriaSummary');
  document.getElementById('logoutBtn').addEventListener('click', logout);

  requireSession('socio').then(async function (session) {
    welcomeTitle.textContent = 'Bienvenido, ' + session.user.nombre;
    welcomeText.textContent = 'Consulta tus indicadores de actividad, explora el directorio profesional y accede a las herramientas de relación del entorno privado.';

    const [observatorio, mensajeria] = await Promise.all([
      request('/api/socios/observatorio/stats', { method: 'GET', headers: {} }),
      request('/api/mensajeria/estadisticas', { method: 'GET', headers: {} })
    ]);

    const items = [
      ['Socios activos', observatorio.kpis.total_socios || 0, 'Perfiles visibles en el ecosistema'],
      ['Provincias activas', observatorio.kpis.provincias_activas || 0, 'Cobertura territorial actual'],
      ['Mentores disponibles', observatorio.kpis.mentores_disponibles || 0, 'Disponibilidad alta en colaboración'],
      ['Mensajes no leídos', mensajeria.estadisticas.mensajes_no_leidos || 0, 'Conversaciones pendientes']
    ];

    kpis.innerHTML = items.map(function (item) {
      return '<article class="metric"><small>' + item[0] + '</small><strong>' + escapeHtml(item[1]) + '</strong><span>' + item[2] + '</span></article>';
    }).join('');

    observatorioSummary.innerHTML = [
      '<p><strong>Proyectos B2B:</strong> ' + escapeHtml(observatorio.kpis.proyectos_b2b || 0) + '</p>',
      '<p><strong>Top especialidades:</strong> ' + escapeHtml((observatorio.charts.top_especialidades || []).map(function (row) { return row.especialidad; }).slice(0, 3).join(', ') || 'Sin datos') + '</p>'
    ].join('');

    mensajeriaSummary.innerHTML = [
      '<p><strong>Conversaciones:</strong> ' + escapeHtml(mensajeria.estadisticas.total_conversaciones || 0) + '</p>',
      '<p><strong>Mensajes este mes:</strong> ' + escapeHtml(mensajeria.estadisticas.mensajes_este_mes || 0) + '</p>'
    ].join('');
  }).catch(function () {});
})();
