(function () {
  const { request, setMessage, escapeHtml } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;
  const $ = (id) => document.getElementById(id);

  const form = $('registerForm');
  const button = $('registerBtn');
  const message = $('registerMessage');
  const typeCards = document.querySelectorAll('.type-toggle .type-card');
  const seccionFisica = $('seccionFisica');
  const labelEntidad = $('labelEntidad');
  const labelCargo = $('labelCargo');
  const labelExperiencia = $('labelExperiencia');

  let tipoSocio = 'numero';

  // ===== Selectores CCAA / provincia con cascada =====
  const ccaaSelect = $('comunidad_autonoma');
  const placeholderCcaa = document.createElement('option');
  placeholderCcaa.value = ''; placeholderCcaa.textContent = 'Selecciona CCAA';
  ccaaSelect.appendChild(placeholderCcaa);
  cat.COMUNIDADES_AUTONOMAS.forEach(function (ca) {
    const opt = document.createElement('option');
    opt.value = ca.slug; opt.textContent = ca.label;
    ccaaSelect.appendChild(opt);
  });
  cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });

  ccaaSelect.addEventListener('change', function () {
    const slug = ccaaSelect.value;
    if (!slug) {
      cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });
      return;
    }
    const ca = cat.COMUNIDADES_AUTONOMAS.find(function (c) { return c.slug === slug; });
    const sel = $('provincia');
    sel.innerHTML = '<option value="">Selecciona provincia</option>';
    ca.provincias.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      sel.appendChild(opt);
    });
  });
  $('provincia').addEventListener('change', function () {
    if (!ccaaSelect.value) {
      const ca = cat.findCcaaByProvincia($('provincia').value);
      if (ca) ccaaSelect.value = ca.slug;
    }
  });

  // ===== Lista de roles del clúster (cards con radio) =====
  const rolList = $('rolList');
  rolList.innerHTML = cat.ROLES_CLUSTER.map(function (r) {
    return (
      '<label class="rol-card" style="--rol-color:' + r.color + '" data-slug="' + r.slug + '">' +
        '<input type="radio" name="rol_cluster" value="' + r.slug + '">' +
        '<span class="swatch"></span>' +
        '<div class="rol-card-body">' +
          '<strong>' + escapeHtml(r.label) + '</strong>' +
          '<span>' + escapeHtml(r.descripcion) + '</span>' +
        '</div>' +
      '</label>'
    );
  }).join('');
  rolList.addEventListener('change', function (ev) {
    if (ev.target.name !== 'rol_cluster') return;
    Array.from(rolList.querySelectorAll('.rol-card')).forEach(function (c) {
      c.classList.toggle('selected', c.dataset.slug === ev.target.value);
    });
  });

  // ===== Lista de especialidades (multi-checkbox) =====
  const espList = $('espList');
  espList.innerHTML = cat.ESPECIALIDADES.map(function (e) {
    return (
      '<label class="esp-row" data-slug="' + e.slug + '">' +
        '<input type="checkbox" value="' + e.slug + '" name="especialidad">' +
        '<div><strong>' + escapeHtml(e.label) + '</strong>' +
        '<span>' + escapeHtml(e.descripcion) + '</span></div>' +
      '</label>'
    );
  }).join('');
  espList.addEventListener('change', function (ev) {
    if (ev.target.name !== 'especialidad') return;
    ev.target.closest('.esp-row').classList.toggle('selected', ev.target.checked);
  });

  // ===== Toggle persona física vs jurídica =====
  function applyTipo(tipo) {
    tipoSocio = tipo;
    typeCards.forEach(function (c) {
      c.classList.toggle('active', c.dataset.tipo === tipo);
      const r = c.querySelector('input[type=radio]');
      if (r) r.checked = c.dataset.tipo === tipo;
    });
    const esCorp = tipo === 'asociado_corporativo';
    document.querySelectorAll('.campo-corp').forEach(function (el) { el.style.display = esCorp ? '' : 'none'; });
    document.querySelectorAll('.campo-fisica').forEach(function (el) { el.style.display = esCorp ? 'none' : ''; });
    seccionFisica.style.display = esCorp ? 'none' : '';

    // Etiquetas adaptadas
    if (esCorp) {
      labelEntidad.textContent = 'Sector / categoría de la organización';
      labelCargo.textContent = 'Persona de contacto: cargo';
      labelExperiencia.textContent = 'Años de actividad';
    } else {
      labelEntidad.textContent = 'Entidad / empresa';
      labelCargo.textContent = 'Cargo actual';
      labelExperiencia.textContent = 'Años de experiencia';
    }
  }
  typeCards.forEach(function (card) {
    card.addEventListener('click', function () { applyTipo(card.dataset.tipo); });
  });
  applyTipo('numero');

  // Muestra el mensaje y hace scroll para que sea visible.
  // Antes la usuaria reportaba "el botón parpadea y no envía"
  // porque el mensaje de error/éxito está DEBAJO del botón y queda
  // fuera del viewport — el usuario no lo veía y creía que el form
  // no respondía. Ahora siempre scroll al mensaje en submit.
  function showAndScroll(ok, text) {
    setMessage(message, ok, text);
    try {
      message.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
      message.scrollIntoView();
    }
  }

  // ===== Envío del formulario =====
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    button.disabled = true;
    button.textContent = 'Enviando...';

    try {
      // Validación pre-envío de los campos que CAMBIAN con el tipo de
      // socio. HTML5 `required` no sirve aquí porque los campos están
      // ocultos con display:none y el navegador o los exige aunque
      // estén ocultos (silenciosamente) o los ignora — depende del
      // engine. Lo gestionamos en JS para ser predecibles.
      if (tipoSocio === 'asociado_corporativo') {
        if (!$('persona_contacto').value.trim() || !$('persona_contacto_apellidos').value.trim()) {
          throw new Error('Persona de contacto: nombre y apellidos son obligatorios');
        }
        if (!$('nombre_organizacion').value.trim()) {
          throw new Error('Nombre de la organización es obligatorio');
        }
      } else {
        if (!$('nombre').value.trim() || !$('apellidos').value.trim()) {
          throw new Error('Nombre y apellidos son obligatorios');
        }
      }

      const especialidades = Array.from(espList.querySelectorAll('input[name=especialidad]:checked'))
        .map(function (cb) { return cb.value; });
      const rolElegido = (rolList.querySelector('input[name=rol_cluster]:checked') || {}).value || null;

      // Para corporativos, usamos los datos de la persona de contacto como nombre/apellidos
      // de la cuenta (la cuenta sigue siendo una persona que opera en nombre de la org).
      let payload;
      if (tipoSocio === 'asociado_corporativo') {
        payload = {
          tipo_socio: 'asociado_corporativo',
          nombre: $('persona_contacto').value.trim(),
          apellidos: $('persona_contacto_apellidos').value.trim(),
          nombre_organizacion: $('nombre_organizacion').value.trim()
        };
      } else {
        payload = {
          tipo_socio: 'numero',
          nombre: $('nombre').value.trim(),
          apellidos: $('apellidos').value.trim()
        };
      }

      Object.assign(payload, {
        email: $('email').value.trim(),
        email_personal: $('email_personal').value.trim() || null,
        telefono: $('telefono').value.trim() || null,
        password: $('password').value,
        entidad: $('entidad').value.trim() || ($('nombre_organizacion') ? $('nombre_organizacion').value.trim() : null),
        cargo_actual: $('cargo_actual').value.trim(),
        anos_experiencia: Number($('anos_experiencia').value || 0),
        web_profesional: $('web_profesional').value.trim() || null,
        comunidad_autonoma: ccaaSelect.value || null,
        provincia: $('provincia').value,
        localidad: $('localidad').value.trim(),
        rol_cluster: rolElegido,
        especialidades: especialidades,
        acepta_mapa_interactivo: $('acepta_mapa_interactivo').checked,
        acepta_visibilidad_datos: $('acepta_visibilidad_datos').checked,
        acepta_mensajeria: $('acepta_mensajeria').checked
      });

      await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      form.reset();
      applyTipo('numero');
      cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });
      Array.from(rolList.querySelectorAll('.rol-card')).forEach(function (c) { c.classList.remove('selected'); });
      Array.from(espList.querySelectorAll('.esp-row')).forEach(function (c) { c.classList.remove('selected'); });
      showAndScroll(true, 'Solicitud enviada correctamente. El acceso quedará habilitado tras la revisión administrativa.');
    } catch (error) {
      showAndScroll(false, error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Enviar solicitud';
    }
  });
})();
