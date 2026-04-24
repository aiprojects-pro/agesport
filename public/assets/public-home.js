(function () {
  const healthBtn = document.getElementById('healthBtn');
  const healthResult = document.getElementById('healthResult');
  const loginBtn = document.getElementById('loginBtn');
  const loginResult = document.getElementById('loginResult');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  function paintResult(node, ok, text) {
    node.className = 'login-result ' + (ok ? 'ok' : 'error');
    node.textContent = text;
  }

  if (healthBtn) {
    healthBtn.addEventListener('click', async function () {
      healthBtn.disabled = true;
      healthBtn.textContent = 'Comprobando...';
      try {
        const response = await fetch('/health', { credentials: 'same-origin' });
        const data = await response.json();
        paintResult(
          healthResult,
          response.ok,
          response.ok
            ? 'Plataforma disponible · actualización ' + new Date(data.timestamp).toLocaleString('es-ES')
            : (data.error || 'No se ha podido verificar la disponibilidad.')
        );
      } catch (error) {
        paintResult(healthResult, false, 'No se ha podido consultar /health.');
      } finally {
        healthBtn.disabled = false;
        healthBtn.textContent = 'Verificar disponibilidad';
      }
    });
  }

  if (loginBtn) {
    loginBtn.addEventListener('click', async function () {
      const email = emailInput ? emailInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!email || !password) {
        paintResult(loginResult, false, 'Introduce email y contraseña para validar el acceso.');
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Accediendo...';

      try {
        const response = await fetch('/api/auth/login/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ email: email, password: password })
        });
        const data = await response.json();

        if (response.ok) {
          paintResult(
            loginResult,
            true,
            'Acceso correcto. Bienvenido, ' + data.admin.nombre + '.'
          );
          window.setTimeout(function () {
            window.location.href = '/admin.html';
          }, 500);
        } else {
          paintResult(loginResult, false, data.error || 'Credenciales inválidas.');
        }
      } catch (error) {
        paintResult(loginResult, false, 'No se ha podido completar el acceso en este momento.');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar al panel';
      }
    });
  }
})();
