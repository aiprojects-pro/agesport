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
})();
