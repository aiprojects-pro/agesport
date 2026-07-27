// landing-editor.js
// Modo edición IN SITU sobre la landing pública. Se activa sólo si el
// visitante tiene sesión de administrador. Todos los cambios se persisten
// vía los endpoints existentes /api/admin/landing/:clave (texto) y
// /api/admin/landing/:clave/imagen (imágenes). No duplica lógica de storage.
//
// Convenciones del DOM: los bloques editables ya vienen marcados desde
// el HTML de la landing con `data-cms="clave"` (texto) o
// `data-cms-img="clave"` (imágenes). Este módulo reutiliza esos marcadores.

(function () {
  'use strict';

  let isAdmin = false;
  let editing = false;
  const original = new Map();   // clave → valor inicial (para revertir)
  const dirty = new Map();      // clave → nuevo valor pendiente de guardar
  const pendingImages = new Map(); // clave → File

  // ---------- Detección de sesión admin ----------
  async function detectAdmin() {
    try {
      const r = await fetch('/api/auth/verify', { credentials: 'same-origin' });
      if (!r.ok) return false;
      const j = await r.json();
      return j.type === 'admin';
    } catch (_) { return false; }
  }

  // ---------- Toolbar flotante ----------
  function buildToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'cms-toolbar';
    toolbar.innerHTML =
      '<button type="button" class="cms-btn cms-btn-primary" id="cmsToggle">✎ Editar página</button>' +
      '<button type="button" class="cms-btn cms-btn-save" id="cmsSave" style="display:none">Guardar cambios <span id="cmsDirtyCount"></span></button>' +
      '<button type="button" class="cms-btn cms-btn-cancel" id="cmsCancel" style="display:none">Cancelar</button>' +
      '<span class="cms-status" id="cmsStatus"></span>';
    document.body.appendChild(toolbar);

    document.getElementById('cmsToggle').addEventListener('click', enterEditMode);
    document.getElementById('cmsSave').addEventListener('click', saveAll);
    document.getElementById('cmsCancel').addEventListener('click', exitEditMode);
  }

  function setStatus(text, kind) {
    const el = document.getElementById('cmsStatus');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'cms-status ' + (kind || '');
    if (text) setTimeout(function () { el.textContent = ''; el.className = 'cms-status'; }, 3500);
  }

  function refreshDirtyCount() {
    const c = dirty.size + pendingImages.size;
    document.getElementById('cmsDirtyCount').textContent = c > 0 ? '(' + c + ')' : '';
    document.getElementById('cmsSave').disabled = c === 0;
  }

  // ---------- Entrar en modo edición ----------
  function enterEditMode() {
    editing = true;
    document.body.classList.add('cms-editing');
    document.getElementById('cmsToggle').style.display = 'none';
    document.getElementById('cmsSave').style.display = '';
    document.getElementById('cmsCancel').style.display = '';

    // Preparar textos editables — guardamos el valor ANTES de añadir el
    // badge para que el "original" no incluya el texto del badge.
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      const clave = el.getAttribute('data-cms');
      if (clave.startsWith('email.')) return;
      const initialText = el.textContent;
      original.set(clave, initialText);
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el.dataset.cmsOriginal = initialText;
      addBadge(el, clave, 'texto');
      el.addEventListener('input', onTextInput);
      el.addEventListener('blur', onTextBlur);
    });

    // Preparar imágenes editables
    document.querySelectorAll('[data-cms-img]').forEach(function (el) {
      const clave = el.getAttribute('data-cms-img');
      addImageOverlay(el, clave);
    });

    setStatus('Modo edición activo. Haz clic en cualquier texto o imagen para editarlo.', 'info');
    refreshDirtyCount();
  }

  // ---------- Salir del modo edición (revirtiendo) ----------
  function exitEditMode() {
    if (dirty.size + pendingImages.size > 0) {
      if (!window.confirm('Hay cambios sin guardar. ¿Salir y descartar?')) return;
    }
    editing = false;
    document.body.classList.remove('cms-editing');
    document.getElementById('cmsToggle').style.display = '';
    document.getElementById('cmsSave').style.display = 'none';
    document.getElementById('cmsCancel').style.display = 'none';

    document.querySelectorAll('[data-cms]').forEach(function (el) {
      el.removeAttribute('contenteditable');
      el.removeEventListener('input', onTextInput);
      el.removeEventListener('blur', onTextBlur);
      // Revertir al valor original
      if (el.dataset.cmsOriginal !== undefined) {
        el.textContent = el.dataset.cmsOriginal;
        delete el.dataset.cmsOriginal;
      }
      removeBadge(el);
    });

    document.querySelectorAll('.cms-img-overlay').forEach(function (n) { n.remove(); });
    dirty.clear();
    pendingImages.clear();
    original.clear();
    refreshDirtyCount();
    setStatus('Salida del modo edición.', 'info');
  }

  // Extrae el texto real del bloque, ignorando el badge (que es un span
  // interno). Sin esto, cada input incluía el nombre de la clave del badge
  // en el valor a guardar.
  function getPlain(el) {
    const clone = el.cloneNode(true);
    const b = clone.querySelector('.cms-badge');
    if (b) b.remove();
    return clone.textContent;
  }

  function onTextInput(ev) {
    const el = ev.currentTarget;
    const clave = el.getAttribute('data-cms');
    const val = getPlain(el);
    if (val === original.get(clave)) {
      dirty.delete(clave);
      el.classList.remove('cms-dirty');
    } else {
      dirty.set(clave, val);
      el.classList.add('cms-dirty');
    }
    refreshDirtyCount();
  }
  function onTextBlur(ev) {
    // Limpia HTML pegado accidentalmente. Preservamos el badge y sólo
    // reemplazamos el contenido de texto — no colapsamos toda la caja.
    const el = ev.currentTarget;
    const clean = getPlain(el);
    // Sólo reescribimos si viene HTML fuera de un plain paste.
    if (el.querySelector('*:not(.cms-badge)')) {
      // Preservamos el badge (si existe) reponiéndolo tras el texto plano.
      const badge = el._cmsBadge;
      el.textContent = clean;
      if (badge) el.appendChild(badge);
    }
  }

  // ---------- Badge de bloque editable ----------
  function addBadge(el, clave, tipo) {
    const badge = document.createElement('span');
    badge.className = 'cms-badge';
    // contenteditable=false para que el caret no entre en el badge y no
    // se pueda modificar. En getPlain lo excluimos del textContent.
    badge.setAttribute('contenteditable', 'false');
    badge.textContent = tipo === 'texto' ? '✎ ' + clave : '🖼 ' + clave;
    el.appendChild ? el.appendChild(badge) : el.parentNode.insertBefore(badge, el);
    el._cmsBadge = badge;
  }
  function removeBadge(el) {
    if (el._cmsBadge) { try { el._cmsBadge.remove(); } catch (_) {} el._cmsBadge = null; }
  }

  // ---------- Overlay para imágenes ----------
  function addImageOverlay(el, clave) {
    const wrap = document.createElement('span');
    wrap.className = 'cms-img-overlay';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cms-btn cms-btn-primary cms-img-btn';
    btn.textContent = '🖼 Cambiar imagen';
    const info = document.createElement('span');
    info.className = 'cms-img-info';
    info.textContent = clave;
    wrap.appendChild(btn);
    wrap.appendChild(info);

    // Colocar el overlay pegado al elemento
    if (el.parentNode) {
      const holder = document.createElement('span');
      holder.className = 'cms-img-holder';
      el.parentNode.insertBefore(holder, el);
      holder.appendChild(el);
      holder.appendChild(wrap);
    }

    btn.addEventListener('click', function () {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', function () {
        if (!input.files || !input.files[0]) return;
        const f = input.files[0];
        pendingImages.set(clave, { file: f, el });
        // Preview local mientras no se guarda
        const url = URL.createObjectURL(f);
        el.setAttribute('src', url);
        info.textContent = clave + ' — ' + f.name + ' (pendiente)';
        wrap.classList.add('cms-dirty');
        refreshDirtyCount();
      });
      input.click();
    });
  }

  // ---------- Guardado ----------
  async function saveAll() {
    const btn = document.getElementById('cmsSave');
    btn.disabled = true;
    setStatus('Guardando…', 'info');
    let okText = 0, okImg = 0, errors = 0;

    // Textos
    for (const [clave, valor] of dirty.entries()) {
      try {
        const r = await fetch('/api/admin/landing/' + encodeURIComponent(clave), {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valor }),
        });
        if (!r.ok) throw new Error(await r.text());
        okText++;
        // El nuevo valor pasa a ser el original
        original.set(clave, valor);
        const el = document.querySelector('[data-cms="' + CSS.escape(clave) + '"]');
        if (el) { el.dataset.cmsOriginal = valor; el.classList.remove('cms-dirty'); }
      } catch (_) { errors++; }
    }
    dirty.clear();

    // Imágenes
    for (const [clave, entry] of pendingImages.entries()) {
      try {
        const fd = new FormData();
        fd.append('imagen', entry.file);
        const r = await fetch('/api/admin/landing/' + encodeURIComponent(clave) + '/imagen', {
          method: 'POST', credentials: 'same-origin', body: fd,
        });
        if (!r.ok) throw new Error(await r.text());
        okImg++;
      } catch (_) { errors++; }
    }
    pendingImages.clear();

    refreshDirtyCount();
    btn.disabled = false;
    const parts = [];
    if (okText) parts.push(okText + ' texto(s)');
    if (okImg) parts.push(okImg + ' imagen(es)');
    if (errors) parts.push(errors + ' error(es)');
    setStatus('Guardado. ' + (parts.join(' · ') || 'sin cambios'), errors ? 'error' : 'ok');
  }

  // ---------- Init ----------
  async function init() {
    isAdmin = await detectAdmin();
    if (!isAdmin) return; // Usuario público: no hay nada que hacer.
    buildToolbar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
