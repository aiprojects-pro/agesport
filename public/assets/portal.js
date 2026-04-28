(function () {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('es-ES');
  }

  function parsePgArray(value) {
    if (Array.isArray(value)) return value;
    if (!value || value === '{}') return [];
    if (typeof value !== 'string') return [];
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
    const inner = trimmed.slice(1, -1);
    if (!inner) return [];

    const items = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < inner.length; index += 1) {
      const char = inner[index];
      const next = inner[index + 1];

      if (char === '"' && inner[index - 1] !== '\\') {
        quoted = !quoted;
        continue;
      }

      if (char === ',' && !quoted) {
        items.push(current);
        current = '';
        continue;
      }

      if (char === '\\' && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      current += char;
    }

    items.push(current);
    return items.map(function (item) { return item.trim(); }).filter(Boolean);
  }

  async function request(url, options) {
    const response = await fetch(url, Object.assign({
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }, options || {}));

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      const message = typeof data === 'object' && data && data.error ? data.error : 'Error inesperado';
      throw new Error(message);
    }

    return data;
  }

  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function $(selector, parent) {
    return (parent || document).querySelector(selector);
  }

  function $$(selector, parent) {
    return Array.from((parent || document).querySelectorAll(selector));
  }

  function clearSession() {
    try {
      localStorage.removeItem('agesport_session_v2');
    } catch (error) {}
  }

  async function verifySession() {
    return request('/api/auth/verify', { method: 'GET', headers: {} });
  }

  async function requireSession(expectedType) {
    const session = await verifySession();
    if (expectedType && session.type !== expectedType) {
      window.location.href = session.type === 'admin' ? '/admin.html' : '/dashboard.html';
      throw new Error('Sesión redirigida');
    }
    return session;
  }

  async function logout() {
    await request('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  function setMessage(node, ok, text) {
    if (!node) return;
    node.className = 'message-box ' + (ok ? 'ok' : 'error');
    node.style.display = 'block';
    node.textContent = text;
  }

  function buildTopbar(pageId, session) {
    const pages = [
      { id: 'dashboard', label: 'Dashboard', href: '/dashboard.html', types: ['socio'] },
      { id: 'directorio', label: 'Directorio', href: '/directorio.html', types: ['socio'] },
      { id: 'mapa', label: 'Mapa', href: '/mapa.html', types: ['socio'] },
      { id: 'mensajes', label: 'Mensajes', href: '/mensajes.html', types: ['socio'] },
      { id: 'admin', label: 'Administración', href: '/admin.html', types: ['admin'] }
    ];

    const links = pages
      .filter(function (page) { return page.types.includes(session.type); })
      .map(function (page) {
        return '<a class="nav-link' + (page.id === pageId ? ' active' : '') + '" href="' + page.href + '">' + page.label + '</a>';
      })
      .join('');

    const initials = window.AgesportData.initials(session.user.nombre, session.user.apellidos || '');
    const subtitle = session.type === 'admin'
      ? session.user.rol
      : ((session.user.provincia || '') + (session.user.rol_cluster ? ' · ' + window.AgesportData.rolMeta(session.user.rol_cluster).nombre : ''));

    return ''
      + '<header class="app-topbar">'
      + '  <div class="shell app-topbar-inner">'
      + '    <a class="app-brand" href="' + (session.type === 'admin' ? '/admin.html' : '/dashboard.html') + '">'
      + '      <span class="app-brand-mark"></span>'
      + '      <span class="app-brand-copy">'
      + '        <strong>MAPA DEL TALENTO</strong>'
      + '        <small>AGESPORT ANDALUCÍA</small>'
      + '      </span>'
      + '    </a>'
      + '    <nav class="app-nav">' + links + '</nav>'
      + '    <div class="app-user-wrap">'
      + '      <a class="app-user" href="' + (session.type === 'admin' ? '/admin.html' : '/perfil.html') + '">'
      + '        <span class="app-user-copy">'
      + '          <strong>' + escapeHtml(session.user.nombre + (session.user.apellidos ? ' ' + session.user.apellidos : '')) + '</strong>'
      + '          <small>' + escapeHtml(subtitle || 'AGESPORT') + '</small>'
      + '        </span>'
      + '        <span class="app-user-avatar">' + escapeHtml(initials) + '</span>'
      + '      </a>'
      + '      <button class="btn btn-ghost btn-sm" id="logoutTopbar" type="button">Salir</button>'
      + '    </div>'
      + '  </div>'
      + '</header>';
  }

  async function mountTopbar(pageId, expectedType) {
    const slot = document.getElementById('topbar');
    if (!slot) return null;
    const session = await requireSession(expectedType);
    slot.outerHTML = buildTopbar(pageId, session);
    const logoutButton = document.getElementById('logoutTopbar');
    if (logoutButton) logoutButton.addEventListener('click', logout);
    return session;
  }

  window.AgesportPortal = {
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    parsePgArray: parsePgArray,
    request: request,
    $: $,
    $$: $$,
    queryParam: queryParam,
    verifySession: verifySession,
    requireSession: requireSession,
    logout: logout,
    clearSession: clearSession,
    setMessage: setMessage,
    buildTopbar: buildTopbar,
    mountTopbar: mountTopbar
  };
})();
