// Acceso de administración — SÓLO la puerta admin.
// El acceso de socios vive en /acceso.html
(function () {
  const { request, verifySession, setMessage } = window.AgesportPortal;
  const adminForm = document.getElementById('adminForm');
  const adminMessage = document.getElementById('adminMessage');
  const adminBtn = document.getElementById('adminBtn');

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
          window.location.href = '/acceso-admin.html?force=admin';
        });
      }
    }).catch(function () { /* sin sesión → form normal */ });
  }

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

  // ===== Recuperación de contraseña admin =====
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
