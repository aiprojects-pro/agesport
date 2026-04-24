(function () {
  const { request, setMessage } = window.AgesportPortal;
  const form = document.getElementById('registerForm');
  const button = document.getElementById('registerBtn');
  const message = document.getElementById('registerMessage');

  function selectedValues(select) {
    return Array.from(select.selectedOptions).map(function (option) {
      return option.value;
    }).slice(0, 3);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Enviando...';

    try {
      await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          nombre: document.getElementById('nombre').value.trim(),
          apellidos: document.getElementById('apellidos').value.trim(),
          email: document.getElementById('email').value.trim(),
          password: document.getElementById('password').value,
          entidad: document.getElementById('entidad').value.trim(),
          cargo_actual: document.getElementById('cargo_actual').value.trim(),
          provincia: document.getElementById('provincia').value,
          localidad: document.getElementById('localidad').value.trim(),
          anos_experiencia: Number(document.getElementById('anos_experiencia').value || 0),
          rol_cluster: document.getElementById('rol_cluster').value || null,
          especialidades: selectedValues(document.getElementById('especialidades')),
          acepta_mapa_interactivo: document.getElementById('acepta_mapa_interactivo').checked,
          acepta_visibilidad_datos: document.getElementById('acepta_visibilidad_datos').checked,
          acepta_mensajeria: document.getElementById('acepta_mensajeria').checked
        })
      });

      form.reset();
      setMessage(message, true, 'Solicitud enviada correctamente. El acceso quedará habilitado tras la revisión administrativa.');
    } catch (error) {
      setMessage(message, false, error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Enviar solicitud';
    }
  });
})();
