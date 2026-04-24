(function () {
  const { requireSession, request, logout, escapeHtml, parsePgArray } = window.AgesportPortal;
  const results = document.getElementById('results');
  const resultsEmpty = document.getElementById('resultsEmpty');
  const resultsInfo = document.getElementById('resultsInfo');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearBtn');
  document.getElementById('logoutBtn').addEventListener('click', logout);

  const fields = ['search', 'provincia', 'rol_cluster', 'especialidad'];

  function buildQuery() {
    const params = new URLSearchParams();
    fields.forEach(function (id) {
      const value = document.getElementById(id).value.trim();
      if (value) params.set(id, value);
    });
    params.set('limit', '50');
    return params.toString();
  }

  async function load() {
    searchBtn.disabled = true;
    searchBtn.textContent = 'Buscando...';
    try {
      const data = await request('/api/socios/directorio?' + buildQuery(), { method: 'GET', headers: {} });
      const socios = data.socios || [];
      resultsInfo.textContent = socios.length + ' perfiles encontrados';
      if (!socios.length) {
        results.innerHTML = '';
        resultsEmpty.style.display = 'block';
        return;
      }
      resultsEmpty.style.display = 'none';
      results.innerHTML = socios.map(function (socio) {
        const especialidades = parsePgArray(socio.especialidades).slice(0, 3);
        const tags = []
          .concat(socio.rol_cluster ? [socio.rol_cluster] : [])
          .concat(especialidades);
        return (
          '<article class="person-card">' +
            '<div class="person-top">' +
              '<div><strong>' + escapeHtml(socio.nombre + ' ' + socio.apellidos) + '</strong><div class="muted">' + escapeHtml(socio.entidad || socio.provincia || '') + '</div></div>' +
              '<div class="actions">' +
                '<a class="btn btn-secondary" href="/perfil.html?id=' + encodeURIComponent(socio.id) + '">Ver perfil</a>' +
                '<a class="btn btn-primary" href="/mensajes.html?receptor=' + encodeURIComponent(socio.id) + '">Contactar</a>' +
              '</div>' +
            '</div>' +
            '<div class="muted">' + escapeHtml(socio.cargo_actual || '') + '</div>' +
            '<div class="person-meta">' + tags.map(function (tag) { return '<span class="tag">' + escapeHtml(tag) + '</span>'; }).join('') + '</div>' +
          '</article>'
        );
      }).join('');
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
    fields.forEach(function (id) { document.getElementById(id).value = ''; });
    load();
  });
  searchBtn.addEventListener('click', load);

  requireSession('socio').then(load).catch(function () {});
})();
