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
    let inQuotes = false;

    for (let i = 0; i < inner.length; i += 1) {
      const char = inner[i];
      const next = inner[i + 1];

      if (char === '"' && inner[i - 1] !== '\\') {
        inQuotes = !inQuotes;
        continue;
      }

      if (char === ',' && !inQuotes) {
        items.push(current);
        current = '';
        continue;
      }

      if (char === '\\' && next === '"') {
        current += '"';
        i += 1;
        continue;
      }

      current += char;
    }

    items.push(current);

    return items
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
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

  async function verifySession() {
    return request('/api/auth/verify', { method: 'GET', headers: {} });
  }

  async function requireSession(expectedType) {
    const session = await verifySession();
    if (expectedType && session.type !== expectedType) {
      window.location.href = session.type === 'admin' ? '/admin.html' : '/panel.html';
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
    node.textContent = text;
  }

  function queryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  window.AgesportPortal = {
    escapeHtml: escapeHtml,
    formatDate: formatDate,
    parsePgArray: parsePgArray,
    request: request,
    verifySession: verifySession,
    requireSession: requireSession,
    logout: logout,
    setMessage: setMessage,
    queryParam: queryParam
  };
})();
