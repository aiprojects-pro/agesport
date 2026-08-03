// avatar.js
// Utilidad compartida para generar avatares con iniciales + color derivado
// del email. Sin dependencias externas. Uso:
//
//   const html = AgesportAvatar.renderAvatar({
//     nombre: 'María', apellidos: 'García', email: 'maria@x.com',
//     fotoUrl: '/uploads/fotos/xxx.jpg', // opcional; si viene, se usa la foto
//     size: 48,                          // opcional, px (default 44)
//   });
//   elemento.innerHTML = html;

(function () {
  'use strict';

  // 12 tonos preseleccionados en la paleta cualitativa del proyecto (WCAG-AA
  // sobre fondo suave). Distribuidos uniformemente para que dos personas
  // consecutivas por email tengan colores diferentes.
  const PALETTE = [
    '#0f895b', // green-deep
    '#0d355f', // navy-deep
    '#1c578d', // navy
    '#a4c639', // green
    '#d97706', // amber
    '#8a4d0a', // brown
    '#b91c1c', // red
    '#6d28d9', // violet
    '#0891b2', // cyan
    '#0369a1', // blue
    '#059669', // emerald
    '#c026d3', // magenta
  ];

  // FNV-1a simple: hash estable, sin dependencias, distribución razonable.
  function hashString(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h;
  }

  function initialsFrom(nombre, apellidos) {
    const n = (nombre || '').trim();
    const a = (apellidos || '').trim();
    const chars = [];
    if (n) chars.push(n[0]);
    if (a) chars.push(a[0]);
    if (!chars.length && n) chars.push(n[0]);
    return chars.slice(0, 2).join('').toUpperCase() || '?';
  }

  function colorFor(email) {
    if (!email) return PALETTE[0];
    return PALETTE[hashString(String(email).toLowerCase()) % PALETTE.length];
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Devuelve el HTML del avatar (string). Si viene fotoUrl, muestra la foto
  // dentro de un círculo del mismo tamaño; si no, iniciales sobre color.
  function renderAvatar(opts) {
    const size = parseInt(opts.size) || 44;
    const label = initialsFrom(opts.nombre, opts.apellidos);
    if (opts.fotoUrl) {
      return '<span class="ag-avatar" style="' +
          'display:inline-block;width:' + size + 'px;height:' + size + 'px;' +
          'border-radius:999px;background-image:url(\'' + escapeHtml(opts.fotoUrl) + '\');' +
          'background-size:cover;background-position:center;flex-shrink:0"></span>';
    }
    const bg = colorFor(opts.email);
    const fontSize = Math.round(size * 0.42);
    return '<span class="ag-avatar" aria-label="' + escapeHtml(label) + '" style="' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'width:' + size + 'px;height:' + size + 'px;border-radius:999px;' +
        'background:' + bg + ';color:#fff;font-weight:700;font-size:' + fontSize + 'px;' +
        'flex-shrink:0;letter-spacing:.01em;font-family:inherit">' +
        escapeHtml(label) + '</span>';
  }

  window.AgesportAvatar = {
    renderAvatar,
    initialsFrom,
    colorFor,
  };
})();
