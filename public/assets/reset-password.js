(function () {
      const { request, setMessage } = window.AgesportPortal;
      const form = document.getElementById('resetForm');
      const msg = document.getElementById('resetMessage');
      const btn = document.getElementById('resetBtn');

      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const isAdmin = params.get('type') === 'admin';
      document.getElementById('requestAgain').href = isAdmin ? '/acceso-admin.html' : '/acceso.html';
      const endpoint = isAdmin
        ? '/api/auth/admin/reset-password'
        : '/api/auth/reset-password';

      if (!token) {
        setMessage(msg, false, 'Falta el token en el enlace. Vuelve a solicitar el restablecimiento.');
        form.style.display = 'none';
        return;
      }

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        const p1 = document.getElementById('newPassword').value;
        const p2 = document.getElementById('newPasswordConfirm').value;
        if (p1 !== p2) {
          setMessage(msg, false, 'Las dos contraseñas no coinciden.');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Restableciendo…';
        try {
          const data = await request(endpoint, {
            method: 'POST',
            body: JSON.stringify({ token, newPassword: p1 })
          });
          setMessage(msg, true, data.message + ' Redirigiendo al acceso…');
          // Redirigimos al login correcto según el tipo de cuenta —
          // antes siempre iba a /acceso.html, dejando fuera al admin.
          const target = isAdmin ? '/acceso-admin.html' : '/acceso.html';
          setTimeout(function () { window.location.href = target; }, 1500);
        } catch (error) {
          setMessage(msg, false, error.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Restablecer contraseña';
        }
      });
    })();
