// Acceso de socios — SÓLO la puerta de socio.
// El acceso de administración vive ahora en /acceso-admin.html
// para separar claramente ambas rutas de entrada.
(function () {
  const { request, verifySession, setMessage } = window.AgesportPortal;
  const socioForm = document.getElementById('socioForm');
  const socioMessage = document.getElementById('socioMessage');
  const socioBtn = document.getElementById('socioBtn');

  // Si el usuario tiene sesión activa, avisamos y le damos opciones
  // en lugar de auto-redirigir a un panel que quizá no quería visitar.
  const forceMode = new URLSearchParams(window.location.search).get('force');
  if (!forceMode) {
    verifySession().then(function (session) {
      const tipoTxt = session.type === 'admin' ? 'administrador' : 'socio';
      const panelUrl = session.type === 'admin' ? '/admin.html' : '/panel.html';
      const banner = document.createElement('div');
      banner.className = 'message-box info';
      banner.style.margin = '20px auto';
      banner.style.maxWidth = '720px';
      banner.style.padding = '14px 18px';
      banner.style.border = '1px solid #cbd5e0';
      banner.style.borderRadius = '8px';
      banner.style.background = '#f7fafc';
      banner.innerHTML =
        'Ya tienes una sesión activa como <strong>' + tipoTxt + '</strong>. ' +
        '<a href="' + panelUrl + '" style="margin-left:8px">Ir al panel</a> · ' +
        '<a href="#" id="forceLogoutLink" style="margin-left:8px">Cerrar sesión y entrar con otra cuenta</a>';
      const main = document.querySelector('main') || document.body;
      main.insertBefore(banner, main.firstChild);
      const link = document.getElementById('forceLogoutLink');
      if (link) {
        link.addEventListener('click', async function (e) {
          e.preventDefault();
          try { await request('/api/auth/logout', { method: 'POST' }); } catch (_) {}
          window.location.href = '/acceso.html?force=socio';
        });
      }
    }).catch(function () { /* sin sesión → form normal */ });
  }

  socioForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    socioBtn.disabled = true;
    socioBtn.textContent = 'Accediendo...';
    try {
      await request('/api/auth/login/socio', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('socioEmail').value.trim(),
          password: document.getElementById('socioPassword').value
        })
      });
      window.location.href = '/panel.html';
    } catch (error) {
      setMessage(socioMessage, false, error.message);
    } finally {
      socioBtn.disabled = false;
      socioBtn.textContent = 'Entrar como socio';
    }
  });

  // ===== Recuperación de contraseña =====
  const forgotLink = document.getElementById('forgotLink');
  const forgotForm = document.getElementById('forgotForm');
  const forgotCancel = document.getElementById('forgotCancel');
  const forgotBtn = document.getElementById('forgotBtn');
  const forgotMessage = document.getElementById('forgotMessage');

  forgotLink.addEventListener('click', function (e) {
    e.preventDefault();
    forgotForm.style.display = 'grid';
    document.getElementById('forgotEmail').focus();
  });
  forgotCancel.addEventListener('click', function () {
    forgotForm.style.display = 'none';
    forgotMessage.textContent = '';
    forgotMessage.className = 'message-box';
  });

  forgotForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    forgotBtn.disabled = true;
    forgotBtn.textContent = 'Enviando…';
    try {
      const data = await request('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('forgotEmail').value.trim()
        })
      });
      setMessage(forgotMessage, true, data.message);
    } catch (error) {
      setMessage(forgotMessage, false, error.message);
    } finally {
      forgotBtn.disabled = false;
      forgotBtn.textContent = 'Enviar enlace';
    }
  });
})();
