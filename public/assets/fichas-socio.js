// public/assets/fichas-socio.js
// Fichas "Socio/a de número" y "Socio corporativo". Los textos se editan
// desde Administración > Landing pública (claves fichas.*) y se muestran en
// la landing, en el primer acceso, en el perfil y en el registro.
//
// fichas.<tipo>.bloques: un bloque por línea, "Título: ventaja | ventaja".
// fichas.<tipo>.compromisos: separados por "|". Cuota y enlace opcionales.
(function () {
  'use strict';

  const TYPES = [
    { key: 'fisica', tipo: 'numero', icon: 'user' },
    { key: 'juridica', tipo: 'asociado_corporativo', icon: 'building' },
  ];

  const DEFAULTS = {
    'fichas.fisica.title': 'Socio/a de número',
    'fichas.fisica.tagline': 'Profesionales comprometidos con la gestión deportiva en Andalucía',
    'fichas.fisica.body': 'Figura dirigida a profesionales que desean formar parte de la principal red profesional de gestión deportiva de Andalucía.',
    'fichas.juridica.title': 'Socio corporativo',
    'fichas.juridica.tagline': 'Empresas, entidades e instituciones comprometidas con la gestión deportiva en Andalucía',
    'fichas.juridica.body': 'Figura dirigida a empresas, entidades e instituciones que desean formar parte de la principal red profesional de gestión deportiva de Andalucía.',
    'fichas.primer_acceso.title': 'Bienvenida/o al Mapa del Talento',
    'fichas.primer_acceso.body': 'Antes de empezar, repasa las ventajas y compromisos de tu tipo de socio y completa tu perfil.',
  };

  const ICONS = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4"/>',
    star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    vote: '<path d="M9 12l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/>',
    hand: '<path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7"/><path d="M12 3v12M8 7l4-4 4 4"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
  };
  function svg(name, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.check) + '</svg>';
  }
  function blockIcon(title) {
    const t = title.toLowerCase();
    if (/visib|reconoc|posicion/.test(t)) return 'star';
    if (/network|relaci/.test(t)) return 'link';
    if (/conoc|desarrollo|formaci/.test(t)) return 'book';
    if (/particip|asociativ|voto/.test(t)) return 'vote';
    return 'check';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  const list = (v) => String(v || '').split('|').map(function (s) { return s.trim(); }).filter(Boolean);
  function blocks(v) {
    return String(v || '').split('\n').map(function (line) {
      const i = line.indexOf(':');
      if (i < 1) return null;
      return { title: line.slice(0, i).trim(), items: list(line.slice(i + 1)) };
    }).filter(function (b) { return b && b.items.length; });
  }
  const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

  let contentPromise = null;
  function loadContent() {
    if (!contentPromise) {
      contentPromise = fetch('/api/public/landing', { credentials: 'same-origin' })
        .then(function (r) { return r.ok ? r.json() : { content: {} }; })
        .then(function (d) {
          const out = Object.assign({}, DEFAULTS);
          Object.keys(d.content || {}).forEach(function (k) {
            if (k.indexOf('fichas.') !== 0) return;
            const v = d.content[k];
            const text = typeof v === 'string' ? v : (v && v.valor);
            // Un valor vacío es intencionado (oculta ese elemento), salvo en
            // los textos principales, que vuelven al valor por defecto.
            if (text != null && (text !== '' || !(k in DEFAULTS))) out[k] = text;
          });
          return out;
        })
        .catch(function () { return Object.assign({}, DEFAULTS); });
    }
    return contentPromise;
  }

  // Panel completo de una ficha. `opts.cta` añade los botones de alta.
  function panelHtml(c, t, opts) {
    const p = 'fichas.' + t.key + '.';
    const cuota = c[p + 'cuota'];
    const link = safeUrl(c[p + 'link']);
    const perfil = c[p + 'perfil'];
    const bl = blocks(c[p + 'bloques']);
    const comp = list(c[p + 'compromisos']);
    const legacy = bl.length ? [] : list(c[p + 'items']);
    return '<div class="fs-panel fs-' + t.key + '">' +
      '<div class="fs-intro">' +
        '<span class="fs-badge">' + svg(t.icon, 26) + '</span>' +
        '<h3 class="fs-title">' + esc(c[p + 'title']) + '</h3>' +
        (c[p + 'tagline'] ? '<p class="fs-tagline">' + esc(c[p + 'tagline']) + '</p>' : '') +
        '<p class="fs-what"><strong>¿Qué es?</strong> ' + esc(c[p + 'body']) + '</p>' +
        (perfil ? '<p class="fs-perfil"><strong>Perfil de entidades:</strong> ' + esc(perfil) + '</p>' : '') +
        (legacy.length ? '<ul class="fs-legacy">' + legacy.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>' : '') +
        (cuota ? '<div class="fs-cuota"><span>Cuota anual</span><strong>' + esc(cuota) + '</strong></div>' : '') +
        (opts.cta || link ? '<div class="fs-actions">' +
          (opts.cta ? '<a class="fs-btn fs-btn-primary" href="/registro.html?tipo=' + t.tipo + '">Solicitar el alta</a>' : '') +
          (link ? '<a class="fs-btn fs-btn-ghost" href="' + esc(link) + '" target="_blank" rel="noopener">Más información</a>' : '') +
        '</div>' : '') +
      '</div>' +
      '<div class="fs-benefits">' +
        '<div class="fs-grid">' + bl.map(function (b) {
          return '<section class="fs-block"><h4><span class="fs-block-icon">' + svg(blockIcon(b.title), 18) + '</span>' + esc(b.title) + '</h4>' +
            '<ul>' + b.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></section>';
        }).join('') + '</div>' +
        (comp.length ? '<section class="fs-commit"><h4>' + svg('hand', 18) + (t.key === 'juridica' ? 'Compromisos de la entidad' : 'Compromisos del socio/a') + '</h4>' +
          '<ol>' + comp.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ol></section>' : '') +
      '</div>' +
    '</div>';
  }

  // Selector de tipo + panel. opts: { tipo, cta, idPrefix }
  function renderFull(container, opts) {
    opts = opts || {};
    return loadContent().then(function (c) {
      const prefix = opts.idPrefix || 'fs';
      const initial = TYPES.find(function (t) { return t.tipo === opts.tipo; }) ||
        TYPES.find(function (t) { return location.hash === '#socio-' + t.key; }) || TYPES[0];
      container.classList.add('fs-root');
      container.innerHTML =
        '<div class="fs-tabs" role="tablist" aria-label="Tipos de socio">' + TYPES.map(function (t) {
          const sel = t === initial;
          return '<button type="button" role="tab" id="' + prefix + '-tab-' + t.key + '" aria-controls="' + prefix + '-panel-' + t.key + '" aria-selected="' + sel + '" tabindex="' + (sel ? 0 : -1) + '" data-fs-tab="' + t.key + '">' +
            svg(t.icon, 18) + '<span>' + esc(c['fichas.' + t.key + '.title']) + '</span>' +
            (opts.tipo === t.tipo ? '<em class="fs-mine">Tu tipo</em>' : '') + '</button>';
        }).join('') + '</div>' +
        TYPES.map(function (t) {
          return '<div role="tabpanel" id="' + prefix + '-panel-' + t.key + '" aria-labelledby="' + prefix + '-tab-' + t.key + '"' + (t === initial ? '' : ' hidden') + '>' + panelHtml(c, t, opts) + '</div>';
        }).join('');
      const tabs = Array.from(container.querySelectorAll('[data-fs-tab]'));
      function select(btn, focus) {
        tabs.forEach(function (b) {
          const on = b === btn;
          b.setAttribute('aria-selected', on);
          b.tabIndex = on ? 0 : -1;
          document.getElementById(b.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) btn.focus();
      }
      tabs.forEach(function (b, i) {
        b.addEventListener('click', function () { select(b); });
        b.addEventListener('keydown', function (ev) {
          if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
            ev.preventDefault();
            select(tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length], true);
          }
        });
      });
    });
  }

  // Diálogo modal (primer acceso y "¿Qué significa cada tipo?").
  // `firstAccess` añade la bienvenida y el enlace al perfil.
  function open(opts) {
    opts = opts || {};
    return loadContent().then(function (c) {
      const dialog = document.createElement('dialog');
      dialog.className = 'fichas-dialog';
      dialog.setAttribute('aria-labelledby', 'fichasTitle');
      dialog.innerHTML = '<div class="fichas-body">' +
        '<h2 id="fichasTitle">' + esc(opts.firstAccess ? c['fichas.primer_acceso.title'] : 'Tipos de socio de AGESPORT') + '</h2>' +
        (opts.firstAccess ? '<p class="fs-dialog-lead">' + esc(c['fichas.primer_acceso.body']) + '</p>' : '') +
        '<div data-fs-dialog></div>' +
        '<div class="fs-dialog-actions">' +
          (opts.firstAccess ? '<a class="fs-btn fs-btn-primary" href="/perfil.html">Completar mi perfil</a>' : '') +
          '<button type="button" class="fs-btn fs-btn-ghost" data-fs-close>' + (opts.firstAccess ? 'Ahora no' : 'Cerrar') + '</button>' +
        '</div></div>';
      document.body.appendChild(dialog);
      dialog.querySelector('[data-fs-close]').addEventListener('click', function () { dialog.close(); });
      dialog.addEventListener('close', function () {
        dialog.remove();
        if (typeof opts.onClose === 'function') opts.onClose();
      });
      return renderFull(dialog.querySelector('[data-fs-dialog]'), { tipo: opts.tipo, idPrefix: 'fsd' }).then(function () {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        dialog.querySelector('[data-fs-close]').focus();
        return dialog;
      });
    });
  }

  // Elementos con data-ficha="clave" toman el texto editable; los enlaces
  // con data-open-fichas abren el diálogo; [data-fichas-full] muestra las
  // fichas completas (landing).
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
    document.querySelectorAll('[data-fichas-full]').forEach(function (box) {
      renderFull(box, { cta: box.hasAttribute('data-cta'), idPrefix: 'fsl' });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hydrate);
  else hydrate();

  window.AgesportFichas = { open: open, render: renderFull };
})();
