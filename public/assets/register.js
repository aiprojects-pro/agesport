(function () {
  'use strict';

  const D = window.AgesportData;
  const { request, setMessage } = window.AgesportPortal;
  const form = document.getElementById('formRegistro');
  const message = document.getElementById('okMsg');

  const provinciaSel = document.getElementById('provinciaSel');
  const rolSel = document.getElementById('rolSel');
  const dispSel = document.getElementById('dispSel');
  const orgTipo = document.getElementById('orgTipo');
  const especialidadesPicker = document.getElementById('especialidadesPicker');

  provinciaSel.innerHTML = '<option value="">Selecciona…</option>' + D.PROVINCIAS.map(function (p) {
    return '<option value="' + p.nombre + '">' + p.nombre + '</option>';
  }).join('');

  rolSel.innerHTML = '<option value="">Selecciona…</option>' + D.ROLES_CLUSTER.map(function (r) {
    return '<option value="' + r.id + '">' + r.nombre + '</option>';
  }).join('');

  dispSel.innerHTML = '<option value="">Selecciona…</option>' + D.DISPONIBILIDADES.map(function (d) {
    return '<option value="' + d.id + '">' + d.etiqueta + '</option>';
  }).join('');

  orgTipo.innerHTML = '<option value="">Selecciona…</option>' + D.TIPOS_CORPORATIVO.map(function (t) {
    return '<option value="' + t.id + '">' + t.etiqueta + '</option>';
  }).join('');

  especialidadesPicker.innerHTML = D.ESPECIALIDADES.map(function (especialidad, index) {
    return ''
      + '<label class="especialidad-pick">'
      + '  <input type="checkbox" name="especialidad_' + index + '" value="' + especialidad + '">'
      + '  <span>' + especialidad + '</span>'
      + '</label>';
  }).join('');

  Array.from(document.querySelectorAll('.especialidad-pick input')).forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      checkbox.parentElement.classList.toggle('active', checkbox.checked);
    });
  });

  function bindSwitch(node) {
    function toggle() {
      const on = !node.classList.contains('on');
      node.classList.toggle('on', on);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    node.addEventListener('click', toggle);
    node.addEventListener('keydown', function (event) {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        toggle();
      }
    });
  }

  ['switchMentor', 'switchOfrece', 'switchBusca', 'switchLicita'].forEach(function (id) {
    bindSwitch(document.getElementById(id));
  });

  function isOn(id) {
    return document.getElementById(id).classList.contains('on');
  }

  function setTipoSocio(tipo) {
    Array.from(document.querySelectorAll('.tipo-card')).forEach(function (card) {
      card.classList.toggle('active', card.getAttribute('data-tipo') === tipo);
    });
    Array.from(document.querySelectorAll('input[name=tipoSocio]')).forEach(function (radio) {
      radio.checked = radio.value === tipo;
    });
    document.getElementById('seccionCorporativo').style.display = tipo === 'corporativo' ? '' : 'none';
    document.getElementById('seccionMentor').style.display = tipo === 'numero' ? '' : 'none';
    document.getElementById('datosTitulo').textContent = tipo === 'corporativo'
      ? 'Datos de contacto (persona representante)'
      : 'Datos personales';
  }

  Array.from(document.querySelectorAll('.tipo-card')).forEach(function (card) {
    card.addEventListener('click', function () {
      setTipoSocio(card.getAttribute('data-tipo'));
    });
  });

  setTipoSocio('numero');

  function selectedEspecialidades() {
    return Array.from(document.querySelectorAll('.especialidad-pick input:checked'))
      .map(function (checkbox) { return checkbox.value; })
      .slice(0, 3);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    const tipoSocio = document.querySelector('input[name=tipoSocio]:checked').value;
    const password = form.elements.reg_password.value;
    const password2 = form.elements.reg_password2.value;
    const especialidades = selectedEspecialidades();

    if (password !== password2) {
      setMessage(message, false, 'Las contraseñas no coinciden.');
      return;
    }

    if (!especialidades.length) {
      setMessage(message, false, 'Selecciona al menos una especialidad.');
      return;
    }

    try {
      await request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          tipo_socio: tipoSocio,
          tipo_corporativo: tipoSocio === 'corporativo' ? form.elements.orgTipo.value || null : null,
          nombre: form.elements.nombre.value.trim(),
          apellidos: form.elements.apellidos.value.trim(),
          email: form.elements.email.value.trim(),
          telefono: form.elements.telefono.value.trim(),
          password: password,
          entidad: tipoSocio === 'corporativo'
            ? form.elements.orgNombre.value.trim()
            : '',
          web_profesional: tipoSocio === 'corporativo'
            ? form.elements.orgWeb.value.trim()
            : form.elements.web.value.trim(),
          provincia: form.elements.provincia.value,
          localidad: form.elements.localidad.value.trim() || form.elements.provincia.value,
          cargo_actual: form.elements.cargo.value.trim() || (tipoSocio === 'corporativo' ? 'Representación institucional' : 'Profesional del deporte'),
          anos_experiencia: Number(form.elements.anos.value || 0),
          rol_cluster: form.elements.rolCluster.value,
          especialidades: especialidades,
          disponibilidad: form.elements.disponibilidad.value || 'Media',
          tutor_mentor: tipoSocio === 'numero' ? isOn('switchMentor') : false,
          b2b_ofrece: isOn('switchOfrece'),
          b2b_busca: isOn('switchBusca'),
          b2b_licita: isOn('switchLicita'),
          linkedin_url: form.elements.linkedin.value.trim(),
          bio_profesional: form.elements.bio.value.trim(),
          acepta_mapa_interactivo: !!form.elements.rgpd2.checked,
          acepta_visibilidad_datos: !!form.elements.rgpd2.checked,
          acepta_mensajeria: !!form.elements.rgpd3.checked,
          acepta_notificaciones_email: !!form.elements.rgpd3.checked,
          visible_web_profesional: true,
          visible_linkedin: true
        })
      });

      form.reset();
      Array.from(document.querySelectorAll('.especialidad-pick')).forEach(function (node) { node.classList.remove('active'); });
      ['switchMentor', 'switchOfrece', 'switchBusca', 'switchLicita'].forEach(function (id) {
        document.getElementById(id).classList.remove('on');
        document.getElementById(id).setAttribute('aria-checked', 'false');
      });
      setTipoSocio('numero');
      setMessage(message, true, 'Solicitud enviada correctamente. Recibirás confirmación cuando tu alta sea revisada.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setMessage(message, false, error.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();
