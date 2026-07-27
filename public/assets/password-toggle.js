// password-toggle.js
// Añade un botón "ver/ocultar" (icono ojo) a cada <input type="password">
// de la página. Se auto-inyecta al cargar; no requiere que el HTML lo
// declare. Reutilizable en login socio, login admin, registro, cambio
// de contraseña y restablecimiento.

(function () {
  'use strict';

  const EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_CLOSED = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20 20 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20 20 0 0 1-3.17 4.35M1 1l22 22M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>';

  function wrap(input) {
    if (input.dataset.pwToggle === '1') return;
    input.dataset.pwToggle = '1';

    const wrapper = document.createElement('div');
    wrapper.className = 'pw-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.setAttribute('aria-label', 'Mostrar contraseña');
    btn.innerHTML = EYE_CLOSED;
    wrapper.appendChild(btn);

    btn.addEventListener('click', function () {
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = showing ? EYE_CLOSED : EYE_OPEN;
      btn.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });
  }

  function scan() {
    document.querySelectorAll('input[type="password"]').forEach(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Auto-detectar inputs añadidos dinámicamente después (ej. formularios que
  // se muestran/ocultan). Un MutationObserver ligero es suficiente.
  const mo = new MutationObserver(function () { scan(); });
  mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
