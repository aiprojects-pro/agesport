// public/assets/fichas-socio.js
// Fichas "socio persona física" / "socio persona jurídica". Los textos se
// editan desde Administración (claves fichas.* del contenido de la landing)
// y se muestran en el primer acceso, en el perfil y en el registro.
(function () {
  'use strict';

  const DEFAULTS = {
    'fichas.fisica.title': 'Socio persona física',
    'fichas.fisica.body': 'Profesional que se asocia a título individual.',
    'fichas.fisica.items': '',
    'fichas.juridica.title': 'Socio persona jurídica',
    'fichas.juridica.body': 'Organización que se asocia como entidad.',
    'fichas.juridica.items': '',
    'fichas.primer_acceso.title': 'Bienvenida/o al Mapa del Talento',
    'fichas.primer_acceso.body': 'Antes de empezar, revisa qué tipo de socio eres y completa tu perfil.',
  };

  let contentPromise = null;
  function loadContent() {
    if (!contentPromise) {
      contentPromise = fetch('/api/public/landing', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { content: {} }; })
        .then(function (d) {
          const out = Object.assign({}, DEFAULTS);
          Object.keys(d.content || {}).forEach(function (k) {
            const v = d.content[k];
            const text = typeof v === 'string' ? v : (v && v.valor);
            if (k.indexOf('fichas.') === 0 && text) out[k] = text;
          });
          return out;
        })
        .catch(function () { return Object.assign({}, DEFAULTS); });
    }
    return contentPromise;
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function card(c, prefix, mine) {
    const box = el('section', 'ficha-card' + (mine ? ' is-mine' : ''));
    if (mine) box.appendChild(el('span', 'mine-tag', 'Tu tipo de socio'));
    box.appendChild(el('h3', null, c[prefix + '.title']));
    box.appendChild(el('p', null, c[prefix + '.body']));
    const items = String(c[prefix + '.items'] || '').split(/[|\n]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (items.length) {
      const ul = el('ul');
      items.forEach(function (i) { ul.appendChild(el('li', null, i)); });
      box.appendChild(ul);
    }
    return box;
  }

  // Pinta las dos fichas dentro de `container` (registro, landing).
  function render(container, opts) {
    opts = opts || {};
    return loadContent().then(function (c) {
      const grid = el('div', 'fichas-grid');
      grid.appendChild(card(c, 'fichas.fisica', opts.tipo && opts.tipo !== 'asociado_corporativo'));
      grid.appendChild(card(c, 'fichas.juridica', opts.tipo === 'asociado_corporativo'));
      container.innerHTML = '';
      container.appendChild(grid);
    });
  }

  // Diálogo modal. `firstAccess` añade el texto de bienvenida y el enlace
  // al perfil; `onClose` se llama al cerrarlo.
  function open(opts) {
    opts = opts || {};
    return loadContent().then(function (c) {
      const dialog = el('dialog', 'fichas-dialog');
      dialog.setAttribute('aria-labelledby', 'fichasTitle');
      const body = el('div', 'fichas-body');
      const title = el('h2', null, opts.firstAccess ? c['fichas.primer_acceso.title'] : 'Tipos de socio');
      title.id = 'fichasTitle';
      body.appendChild(title);
      if (opts.firstAccess) body.appendChild(el('p', 'muted', c['fichas.primer_acceso.body']));
      const grid = el('div', 'fichas-grid');
      grid.appendChild(card(c, 'fichas.fisica', opts.tipo && opts.tipo !== 'asociado_corporativo'));
      grid.appendChild(card(c, 'fichas.juridica', opts.tipo === 'asociado_corporativo'));
      body.appendChild(grid);
      const actions = el('div', 'actions');
      if (opts.firstAccess) {
        const go = el('a', 'btn btn-primary', 'Completar mi perfil');
        go.href = '/perfil.html';
        actions.appendChild(go);
      }
      const close = el('button', 'btn btn-secondary', opts.firstAccess ? 'Ahora no' : 'Cerrar');
      close.type = 'button';
      close.addEventListener('click', function () { dialog.close(); });
      actions.appendChild(close);
      body.appendChild(actions);
      dialog.appendChild(body);
      dialog.addEventListener('close', function () {
        dialog.remove();
        if (typeof opts.onClose === 'function') opts.onClose();
      });
      document.body.appendChild(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      close.focus();
      return dialog;
    });
  }

  // Elementos con data-ficha="clave" toman el texto editable; los enlaces
  // con data-open-fichas abren el diálogo.
  function hydrate() {
    const nodes = document.querySelectorAll('[data-ficha]');
    if (nodes.length) {
      loadContent().then(function (c) {
        nodes.forEach(function (n) { const v = c[n.getAttribute('data-ficha')]; if (v) n.textContent = v; });
      });
    }
    document.querySelectorAll('[data-open-fichas]').forEach(function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); open({}); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
  else hydrate();

  window.AgesportFichas = { open: open, render: render };
})();
