(function () {
  const { request, verifySession, setMessage } = window.AgesportPortal;
  const socioForm = document.getElementById('socioForm');
  const adminForm = document.getElementById('adminForm');
  const socioMessage = document.getElementById('socioMessage');
  const adminMessage = document.getElementById('adminMessage');
  const socioBtn = document.getElementById('socioBtn');
  const adminBtn = document.getElementById('adminBtn');

  // Detección de sesión activa: en lugar de auto-redirigir (lo que
  // hacía que el CTA "Acceso socio" llevara a un admin al panel admin
  // y viceversa — hallazgo MEDIA auditoría 10 jun), mostramos un aviso
  // explícito al inicio de la página con dos opciones: "Ir al panel"
  // o "Cerrar sesión y entrar con otra cuenta". El usuario decide.
  //
  // Si se pasa ?force=socio o ?force=admin en la URL, ignoramos la
  // sesión activa y mostramos el formulario directamente.
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
          try {
            await request('/api/auth/logout', { method: 'POST' });
          } catch (_) { /* nada */ }
          window.location.href = '/acceso.html?force=socio';
        });
      }
    }).catch(function () { /* sin sesión → muestra el form normal */ });
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

  adminForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    adminBtn.disabled = true;
    adminBtn.textContent = 'Accediendo...';
    try {
      await request('/api/auth/login/admin', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('adminEmail').value.trim(),
          password: document.getElementById('adminPassword').value
        })
      });
      window.location.href = '/admin.html';
    } catch (error) {
      setMessage(adminMessage, false, error.message);
    } finally {
      adminBtn.disabled = false;
      adminBtn.textContent = 'Entrar a administración';
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
      // El endpoint responde siempre OK por seguridad — un error aquí es de red
      setMessage(forgotMessage, false, error.message);
    } finally {
      forgotBtn.disabled = false;
      forgotBtn.textContent = 'Enviar enlace';
    }
  });

  // ===== Recuperación de contraseña — admin =====
  const forgotAdminLink = document.getElementById('forgotAdminLink');
  const forgotAdminForm = document.getElementById('forgotAdminForm');
  const forgotAdminCancel = document.getElementById('forgotAdminCancel');
  const forgotAdminBtn = document.getElementById('forgotAdminBtn');
  const forgotAdminMessage = document.getElementById('forgotAdminMessage');

  forgotAdminLink.addEventListener('click', function (e) {
    e.preventDefault();
    forgotAdminForm.style.display = 'grid';
    document.getElementById('forgotAdminEmail').focus();
  });
  forgotAdminCancel.addEventListener('click', function () {
    forgotAdminForm.style.display = 'none';
    forgotAdminMessage.textContent = '';
    forgotAdminMessage.className = 'message-box';
  });

  forgotAdminForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    forgotAdminBtn.disabled = true;
    forgotAdminBtn.textContent = 'Enviando…';
    try {
      const data = await request('/api/auth/admin/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('forgotAdminEmail').value.trim()
        })
      });
      setMessage(forgotAdminMessage, true, data.message);
    } catch (error) {
      setMessage(forgotAdminMessage, false, error.message);
    } finally {
      forgotAdminBtn.disabled = false;
      forgotAdminBtn.textContent = 'Enviar enlace';
    }
  });
})();
