(function () {
  const { request, verifySession, setMessage } = window.AgesportPortal;
  const socioForm = document.getElementById('socioForm');
  const adminForm = document.getElementById('adminForm');
  const socioMessage = document.getElementById('socioMessage');
  const adminMessage = document.getElementById('adminMessage');
  const socioBtn = document.getElementById('socioBtn');
  const adminBtn = document.getElementById('adminBtn');

  verifySession().then(function (session) {
    window.location.href = session.type === 'admin' ? '/admin.html' : '/panel.html';
  }).catch(function () {});

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
