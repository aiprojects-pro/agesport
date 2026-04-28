(function () {
  const { request, verifySession, setMessage } = window.AgesportPortal;
  const picks = document.querySelectorAll('.role-pick');
  const formSocio = document.getElementById('formSocio');
  const formAdmin = document.getElementById('formAdmin');
  const msg = document.getElementById('msg');
  const btnSocio = document.getElementById('btnSocio');
  const btnAdmin = document.getElementById('btnAdmin');

  verifySession().then(function (session) {
    window.location.href = session.type === 'admin' ? '/admin.html' : '/dashboard.html';
  }).catch(function () {});

  picks.forEach(function (pick) {
    pick.addEventListener('click', function () {
      picks.forEach(function (node) { node.classList.remove('active'); });
      pick.classList.add('active');
      const role = pick.getAttribute('data-role');
      formSocio.style.display = role === 'socio' ? '' : 'none';
      formAdmin.style.display = role === 'admin' ? '' : 'none';
      msg.className = 'message-box';
      msg.textContent = '';
    });
  });

  formSocio.addEventListener('submit', async function (event) {
    event.preventDefault();
    btnSocio.disabled = true;
    try {
      await request('/api/auth/login/socio', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('socio-email').value.trim(),
          password: document.getElementById('socio-pass').value
        })
      });
      setMessage(msg, true, 'Acceso correcto. Redirigiendo al panel...');
      window.setTimeout(function () { window.location.href = '/dashboard.html'; }, 300);
    } catch (error) {
      setMessage(msg, false, error.message);
    } finally {
      btnSocio.disabled = false;
    }
  });

  formAdmin.addEventListener('submit', async function (event) {
    event.preventDefault();
    btnAdmin.disabled = true;
    try {
      await request('/api/auth/login/admin', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('admin-email').value.trim(),
          password: document.getElementById('admin-pass').value
        })
      });
      setMessage(msg, true, 'Acceso correcto. Redirigiendo a administración...');
      window.setTimeout(function () { window.location.href = '/admin.html'; }, 300);
    } catch (error) {
      setMessage(msg, false, error.message);
    } finally {
      btnAdmin.disabled = false;
    }
  });
})();
