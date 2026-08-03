// cookie-banner.js
// Banner de aviso de cookies visible en cualquier página donde se cargue
// este script. Sólo se muestra si el usuario NO ha aceptado antes.
//
// Sólo usamos cookies TÉCNICAS (JWT de sesión). No hay tracking ni
// analítica de terceros. Aún así, RGPD + LSSI obligan a informar.

(function () {
  'use strict';

  const KEY = 'agesport_cookies_accepted_v1';
  if (localStorage.getItem(KEY) === '1') return;
  if (document.body && document.body.dataset && document.body.dataset.noCookieBanner === '1') return;

  const style = document.createElement('style');
  style.textContent = [
    '#cookie-banner{position:fixed;left:20px;right:20px;bottom:20px;max-width:720px;margin:0 auto;',
    'background:#0d355f;color:#fff;border-radius:16px;padding:18px 20px;',
    'box-shadow:0 20px 50px rgba(0,0,0,.25);z-index:9998;',
    'display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;',
    'font-family:"Manrope","Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:.92rem;line-height:1.5}',
    '#cookie-banner p{margin:0;flex:1;min-width:260px}',
    '#cookie-banner a{color:#a4cf2f;text-decoration:underline}',
    '#cookie-banner .cb-actions{display:flex;gap:8px;flex-wrap:wrap}',
    '#cookie-banner button{border:0;border-radius:999px;padding:9px 16px;font-weight:700;cursor:pointer;font-size:.88rem}',
    '#cookie-banner .cb-accept{background:#a4cf2f;color:#0d355f}',
    '#cookie-banner .cb-info{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.4)}',
    '@media (max-width:560px){#cookie-banner{flex-direction:column;align-items:stretch;text-align:left}',
    '  #cookie-banner .cb-actions{justify-content:flex-end}}',
  ].join('');

  const banner = document.createElement('div');
  banner.id = 'cookie-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-live', 'polite');
  banner.setAttribute('aria-label', 'Aviso de cookies');
  banner.innerHTML =
    '<p>Esta plataforma sólo utiliza <strong>cookies técnicas</strong> (sesión y seguridad). ' +
    'No usamos cookies de análisis, publicidad ni terceros. ' +
    'Consulta la <a href="/privacidad.html" target="_blank" rel="noopener">política de privacidad</a> para más detalle.</p>' +
    '<div class="cb-actions">' +
      '<a class="cb-info" href="/privacidad.html" target="_blank" rel="noopener" style="text-decoration:none;line-height:1;display:inline-flex;align-items:center;padding:9px 16px;border-radius:999px">Más información</a>' +
      '<button type="button" class="cb-accept" id="cb-accept-btn">Aceptar y cerrar</button>' +
    '</div>';

  function mount() {
    document.head.appendChild(style);
    document.body.appendChild(banner);
    document.getElementById('cb-accept-btn').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (_) { /* modo privado */ }
      banner.remove();
      style.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
