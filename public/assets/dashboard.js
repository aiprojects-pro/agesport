(function () {
  'use strict';

  const { mountTopbar, request, escapeHtml, parsePgArray } = window.AgesportPortal;

  function renderBars(node, items) {
    const max = Math.max.apply(null, items.map(function (item) { return item.value; })) || 1;
    node.innerHTML = items.map(function (item) {
      const pct = Math.max(Math.round((item.value / max) * 100), 8);
      return ''
        + '<div class="bar-row">'
        + '  <span class="bar-label">' + escapeHtml(item.label) + '</span>'
        + '  <div class="bar-track"><div class="bar-fill" style="width:' + pct + '%">' + escapeHtml(item.value) + '</div></div>'
        + '</div>';
    }).join('');
  }

  function renderDonut(node, legendNode, rows) {
    const cx = 80;
    const cy = 80;
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    const total = rows.reduce(function (sum, row) { return sum + Number(row.total || 0); }, 0) || 1;

    let acc = 0;
    let html = '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" stroke="#eef2f6" stroke-width="22" />';

    rows.forEach(function (row) {
      const meta = window.AgesportData.rolMeta(row.rol_cluster);
      const len = (Number(row.total || 0) / total) * circumference;
      const offset = circumference - acc;
      html += ''
        + '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '"'
        + ' fill="none" stroke="' + meta.color + '" stroke-width="22"'
        + ' stroke-dasharray="' + len + ' ' + (circumference - len) + '"'
        + ' stroke-dashoffset="' + offset + '"'
        + ' transform="rotate(-90 ' + cx + ' ' + cy + ')" />';
      acc += len;
    });

    html += ''
      + '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" font-size="26" font-weight="800" fill="#0d355f" font-family="Manrope, sans-serif">' + total + '</text>'
      + '<text x="' + cx + '" y="' + (cy + 16) + '" text-anchor="middle" font-size="10" fill="#5b6a78" font-family="Manrope, sans-serif" letter-spacing="1">SOCIOS</text>';

    node.innerHTML = html;
    legendNode.innerHTML = rows.map(function (row) {
      const meta = window.AgesportData.rolMeta(row.rol_cluster);
      const pct = Math.round((Number(row.total || 0) / total) * 100);
      return ''
        + '<div class="donut-legend-row">'
        + '  <span class="donut-legend-dot" style="background:' + meta.color + '"></span>'
        + '  <span style="flex:1;color:var(--muted);font-size:.88rem">' + escapeHtml(meta.nombre) + '</span>'
        + '  <strong>' + escapeHtml(row.total) + '</strong>'
        + '  <span style="color:var(--muted-soft);font-size:.78rem;margin-left:6px">' + pct + '%</span>'
        + '</div>';
    }).join('');
  }

  mountTopbar('dashboard', 'socio').then(async function () {
    const observatorio = await request('/api/socios/observatorio/stats', { method: 'GET', headers: {} });
    const directory = await request('/api/socios/directorio?limit=200', { method: 'GET', headers: {} });

    const socios = directory.socios || [];
    const totalSocios = Number(observatorio.kpis.total_socios || socios.length || 0);
    const proyectosB2B = Number(observatorio.kpis.proyectos_b2b || 0);
    const mentores = Number(observatorio.kpis.mentores_disponibles || 0);
    const provinciasActivas = Number(observatorio.kpis.provincias_activas || 0);

    document.getElementById('kpis').innerHTML = [
      ['Socios registrados', totalSocios, '👥', 'Perfiles activos en la plataforma'],
      ['Provincias activas', provinciasActivas + '<sub>/8</sub>', '📍', 'Cobertura actual de Andalucía'],
      ['Mentores disponibles', mentores, '🎓', 'Socios con disponibilidad de tutoría'],
      ['Proyectos B2B activos', proyectosB2B, '🤝', 'Interés declarado en colaboración']
    ].map(function (item) {
      return ''
        + '<article class="kpi-card">'
        + '  <div class="kpi-head"><span class="kpi-label">' + item[0] + '</span><span class="kpi-icon">' + item[2] + '</span></div>'
        + '  <div class="kpi-value">' + item[1] + '</div>'
        + '  <div class="kpi-foot">' + item[3] + '</div>'
        + '</article>';
    }).join('');

    const provincias = observatorio.charts.distribucion_provincias.map(function (row) {
      return { label: row.provincia, value: Number(row.total || 0) };
    });
    renderBars(document.getElementById('barsProvincia'), provincias);

    const especialidadesMap = {};
    socios.forEach(function (socio) {
      parsePgArray(socio.especialidades).forEach(function (especialidad) {
        especialidadesMap[especialidad] = (especialidadesMap[especialidad] || 0) + 1;
      });
    });

    const topEspecialidades = Object.keys(especialidadesMap)
      .map(function (label) { return { label: label, value: especialidadesMap[label] }; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 6);
    renderBars(document.getElementById('barsEspecialidad'), topEspecialidades.length ? topEspecialidades : [{ label: 'Sin datos', value: 0 }]);

    const disponibilidadMap = {};
    socios.forEach(function (socio) {
      disponibilidadMap[socio.disponibilidad || 'Sin definir'] = (disponibilidadMap[socio.disponibilidad || 'Sin definir'] || 0) + 1;
    });
    const disponibilidades = window.AgesportData.DISPONIBILIDADES.map(function (disp) {
      return { label: disp.etiqueta.split(' · ')[0], value: disponibilidadMap[disp.id] || 0 };
    });
    renderBars(document.getElementById('barsDisp'), disponibilidades);

    renderDonut(
      document.getElementById('donutRol'),
      document.getElementById('donutLegend'),
      observatorio.charts.roles_cluster || []
    );
  }).catch(function () {});
})();
