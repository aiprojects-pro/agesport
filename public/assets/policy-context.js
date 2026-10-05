(function () {
  window.AgesportPolicyContext = { id: null };
  const p = document.createElement('p');
  p.className = 'muted';
  p.setAttribute('role', 'status');
  const form = document.getElementById('registerForm') || document.getElementById('profileForm');
  if (form) form.appendChild(p);
  async function load() {
    try {
      const response = await fetch('/api/public/privacidad', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const v = await response.json();
      window.AgesportPolicyContext.id = v.id;
      document.querySelectorAll('a[href^="/privacidad.html"]').forEach((a) => {
        a.href = v.url;
        a.target = '_blank';
        a.rel = 'noopener';
      });
      p.textContent =
        'Política de privacidad: versión ' +
        v.id +
        (v.legacy ? ' (texto existente de junio de 2026).' : '.');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Consultar versión actual';
      b.onclick = async () => {
        await load();
        window.open('/privacidad.html', '_blank', 'noopener');
      };
      p.appendChild(b);
    } catch (_) {
      p.textContent = 'No se pudo cargar la versión de privacidad. Reintentar';
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Reintentar';
      b.onclick = load;
      p.appendChild(b);
    }
  }
  load();
})();
