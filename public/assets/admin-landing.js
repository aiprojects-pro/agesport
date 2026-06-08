// public/assets/admin-landing.js
// Editor del CMS de la landing pública. Una fila por clave, edición inline,
// guardado al perder el foco o al pulsar Enter (Ctrl+Enter en textareas).

(function () {
  'use strict';

  const { request } = window.AgesportPortal;
  let loaded = false;

  function showMessage(text, type) {
    const box = document.getElementById('landingMessage');
    if (!box) return;
    box.textContent = text;
    box.className = 'message-box ' + (type || 'info');
    setTimeout(() => {
      box.textContent = '';
      box.className = 'message-box';
    }, 3500);
  }

  function renderRow(item) {
    const keyCell = `<code style="font-size:12px;color:#666">${escapeHtml(item.clave)}</code>`;

    if (item.tipo === 'image') {
      const url = item.valor || '';
      const preview = url
        ? `<img src="${escapeAttr(url)}" alt="${escapeAttr(item.clave)}" style="max-height:48px;max-width:140px;background:#f5f5f5;padding:4px;border:1px solid #ddd;border-radius:4px">`
        : '<span class="muted" style="font-size:12px">(sin imagen)</span>';
      return `
        <div class="landing-row" style="display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid #eee">
          ${keyCell}
          <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
            ${preview}
            <code style="font-size:11px;color:#888;flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(url)}</code>
            <label class="btn btn-secondary" style="cursor:pointer;font-size:13px;padding:6px 12px">
              Subir imagen
              <input type="file" accept="image/*" data-image-key="${escapeAttr(item.clave)}" style="display:none">
            </label>
          </div>
        </div>
      `;
    }

    const isLong = item.valor.length > 80 || /\n/.test(item.valor);
    const tag = isLong ? 'textarea' : 'input';
    const attrs = isLong
      ? 'rows="3" style="width:100%;font-family:inherit;font-size:14px"'
      : 'type="text" style="width:100%;font-size:14px"';
    const value = isLong ? '' : ` value="${escapeAttr(item.valor)}"`;
    const inner = isLong ? escapeHtml(item.valor) : '';
    return `
      <div class="landing-row" style="display:grid;grid-template-columns:220px 1fr;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #eee">
        ${keyCell}
        <${tag} data-key="${escapeAttr(item.clave)}" ${attrs}${value}>${inner}</${tag}>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  async function loadEditor() {
    const container = document.getElementById('landingEditor');
    if (!container) return;
    container.innerHTML = '<p class="muted">Cargando…</p>';
    try {
      const data = await request('/api/admin/landing');
      if (!Array.isArray(data.content) || data.content.length === 0) {
        container.innerHTML = '<p class="muted">No hay claves todavía. Aplica la migración 007.</p>';
        return;
      }
      container.innerHTML = data.content.map(renderRow).join('');
      wireRows(container);
    } catch (err) {
      container.innerHTML = '<p class="muted">Error cargando contenido: ' + escapeHtml(err.message || err) + '</p>';
    }
  }

  function wireRows(container) {
    // Inputs/textareas de texto
    container.querySelectorAll('[data-key]').forEach((field) => {
      const original = field.value !== undefined ? field.value : field.textContent;
      field.dataset.original = original;
      field.addEventListener('blur', () => saveIfChanged(field));
      field.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' && field.tagName === 'INPUT') ||
            (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
          e.preventDefault();
          field.blur();
        }
      });
    });

    // Inputs de file para imágenes
    container.querySelectorAll('[data-image-key]').forEach((input) => {
      input.addEventListener('change', () => uploadImage(input));
    });
  }

  async function uploadImage(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const clave = input.getAttribute('data-image-key');
    const form = new FormData();
    form.append('imagen', file);
    try {
      const res = await fetch(`/api/admin/landing/${encodeURIComponent(clave)}/imagen`, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo imagen');
      showMessage(`Imagen subida para ${clave}`, 'ok');
      // Recargar para reflejar el preview actualizado
      loaded = false;
      loadEditor();
    } catch (err) {
      showMessage(`Error: ${err.message || err}`, 'error');
    } finally {
      input.value = '';
    }
  }

  async function saveIfChanged(field) {
    const current = field.value;
    if (current === field.dataset.original) return;
    const clave = field.getAttribute('data-key');
    try {
      await request(`/api/admin/landing/${encodeURIComponent(clave)}`, {
        method: 'PUT',
        body: JSON.stringify({ valor: current }),
      });
      field.dataset.original = current;
      field.style.outline = '2px solid #2D7A4A';
      setTimeout(() => { field.style.outline = ''; }, 800);
      showMessage(`Guardado: ${clave}`, 'ok');
    } catch (err) {
      showMessage(`Error guardando ${clave}: ${err.message || err}`, 'error');
      field.value = field.dataset.original;
    }
  }

  // Lazy-load: sólo cargar cuando el tab esté visible
  document.getElementById('adminTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab="landing"]');
    if (btn && !loaded) {
      loaded = true;
      loadEditor();
    }
  });
})();
