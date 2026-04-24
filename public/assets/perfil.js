(function () {
  const { requireSession, request, logout, setMessage, queryParam } = window.AgesportPortal;
  const title = document.getElementById('profileTitle');
  const intro = document.getElementById('profileIntro');
  const profileActions = document.getElementById('profileActions');
  const contactBtn = document.getElementById('contactBtn');
  const form = document.getElementById('profileForm');
  const saveBtn = document.getElementById('saveBtn');
  const profileMessage = document.getElementById('profileMessage');
  const passwordForm = document.getElementById('passwordForm');
  const passwordBtn = document.getElementById('passwordBtn');
  const passwordMessage = document.getElementById('passwordMessage');
  document.getElementById('logoutBtn').addEventListener('click', logout);

  let currentSession;
  let profileId;

  function fillForm(socio) {
    ['nombre', 'apellidos', 'email', 'entidad', 'cargo_actual', 'anos_experiencia', 'provincia', 'localidad', 'linkedin_url', 'web_profesional', 'direccion_completa']
      .forEach(function (id) {
        document.getElementById(id).value = socio[id] || '';
      });
    document.getElementById('acepta_mensajeria').checked = !!socio.acepta_mensajeria;
    document.getElementById('visible_web_profesional').checked = !!socio.visible_web_profesional;
    document.getElementById('visible_linkedin').checked = !!socio.visible_linkedin;
  }

  requireSession('socio').then(async function (session) {
    currentSession = session;
    profileId = queryParam('id') || session.user.id;
    const data = await request('/api/socios/perfil/' + profileId, { method: 'GET', headers: {} });
    const socio = data.socio;
    title.textContent = profileId == session.user.id ? 'Mi perfil profesional' : socio.nombre + ' ' + socio.apellidos;
    intro.textContent = profileId == session.user.id
      ? 'Actualiza tu información profesional, visibilidad y preferencias del entorno privado.'
      : 'Consulta la ficha profesional dentro del directorio privado.';

    if (String(profileId) !== String(session.user.id)) {
      profileActions.style.display = 'flex';
      contactBtn.href = '/mensajes.html?receptor=' + encodeURIComponent(profileId);
      contactBtn.textContent = 'Contactar con ' + socio.nombre;
      fillForm(socio);
      Array.from(form.elements).forEach(function (element) { element.disabled = true; });
      saveBtn.style.display = 'none';
      passwordForm.style.display = 'none';
      return;
    }

    fillForm(socio);
  }).catch(function () {});

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (String(profileId) !== String(currentSession.user.id)) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    try {
      await request('/api/socios/perfil', {
        method: 'PUT',
        body: JSON.stringify({
          nombre: document.getElementById('nombre').value.trim(),
          apellidos: document.getElementById('apellidos').value.trim(),
          entidad: document.getElementById('entidad').value.trim(),
          cargo_actual: document.getElementById('cargo_actual').value.trim(),
          anos_experiencia: Number(document.getElementById('anos_experiencia').value || 0),
          provincia: document.getElementById('provincia').value,
          localidad: document.getElementById('localidad').value.trim(),
          linkedin_url: document.getElementById('linkedin_url').value.trim(),
          web_profesional: document.getElementById('web_profesional').value.trim(),
          direccion_completa: document.getElementById('direccion_completa').value.trim(),
          acepta_mensajeria: document.getElementById('acepta_mensajeria').checked,
          visible_web_profesional: document.getElementById('visible_web_profesional').checked,
          visible_linkedin: document.getElementById('visible_linkedin').checked
        })
      });
      setMessage(profileMessage, true, 'Perfil actualizado correctamente.');
    } catch (error) {
      setMessage(profileMessage, false, error.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
    }
  });

  passwordForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    passwordBtn.disabled = true;
    passwordBtn.textContent = 'Actualizando...';
    try {
      await request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: document.getElementById('currentPassword').value,
          newPassword: document.getElementById('newPassword').value
        })
      });
      passwordForm.reset();
      setMessage(passwordMessage, true, 'Contraseña actualizada correctamente.');
    } catch (error) {
      setMessage(passwordMessage, false, error.message);
    } finally {
      passwordBtn.disabled = false;
      passwordBtn.textContent = 'Actualizar contraseña';
    }
  });
})();
