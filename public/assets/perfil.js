(function () {
  'use strict';

  const { mountTopbar, request, queryParam, setMessage, escapeHtml } = window.AgesportPortal;
  const D = window.AgesportData;
  const photoInput = document.getElementById('photoInput');
  const photoNode = document.getElementById('profilePhoto');
  const photoKeyPrefix = 'agesport_photo_';
  let session;
  let profileId;
  let currentSocio;

  function setPhoto(id) {
    const stored = localStorage.getItem(photoKeyPrefix + id);
    if (stored) {
      photoNode.innerHTML = '<img src="' + stored + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">';
      return;
    }
    const rol = D.rolMeta(currentSocio.rol_cluster);
    photoNode.innerHTML = '<span style="display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:' + rol.color + ';color:#fff;font-size:2rem;font-weight:800">' + escapeHtml(D.initials(currentSocio.nombre, currentSocio.apellidos)) + '</span>';
  }

  function bindSwitch(node, initial) {
    if (initial) node.classList.add('on');
    node.setAttribute('aria-checked', initial ? 'true' : 'false');
    node.addEventListener('click', function () {
      const on = !node.classList.contains('on');
      node.classList.toggle('on', on);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function fillEspecialidades(selected) {
    const selectedSet = new Set(selected);
    document.getElementById('especialidadesPicker').innerHTML = D.ESPECIALIDADES.map(function (especialidad, index) {
      const active = selectedSet.has(especialidad);
      return ''
        + '<label class="especialidad-pick' + (active ? ' active' : '') + '">'
        + '  <input type="checkbox" value="' + especialidad + '" name="esp_' + index + '"' + (active ? ' checked' : '') + '>'
        + '  <span>' + especialidad + '</span>'
        + '</label>';
    }).join('');
    Array.from(document.querySelectorAll('#especialidadesPicker input')).forEach(function (checkbox) {
      checkbox.addEventListener('change', function () {
        checkbox.parentElement.classList.toggle('active', checkbox.checked);
      });
    });
  }

  function selectedEspecialidades() {
    return Array.from(document.querySelectorAll('#especialidadesPicker input:checked'))
      .map(function (checkbox) { return checkbox.value; })
      .slice(0, 3);
  }

  function makeReadonly() {
    Array.from(document.querySelectorAll('input, select, textarea, button')).forEach(function (node) {
      if (node.id === 'logoutTopbar') return;
      node.disabled = true;
    });
  }

  mountTopbar('perfil', 'socio').then(async function (verified) {
    session = verified;
    profileId = queryParam('id') || session.user.id;
    const response = await request('/api/socios/perfil/' + profileId, { method: 'GET', headers: {} });
    currentSocio = response.socio;

    document.getElementById('pageTitle').textContent = String(profileId) === String(session.user.id) ? 'Mi perfil' : 'Perfil profesional';
    document.getElementById('pageSubtitle').textContent = String(profileId) === String(session.user.id)
      ? 'Mantén actualizada tu información profesional. Estos datos alimentan el directorio, el mapa y los emparejamientos B2B.'
      : 'Ficha profesional del socio dentro del ecosistema privado de AGESPORT.';

    document.getElementById('profileName').textContent = (currentSocio.nombre || '') + ' ' + (currentSocio.apellidos || '');
    document.getElementById('profileRol').textContent = D.rolMeta(currentSocio.rol_cluster).nombre;
    document.getElementById('fNombre').value = currentSocio.nombre || '';
    document.getElementById('fApellidos').value = currentSocio.apellidos || '';
    document.getElementById('fEmail').value = currentSocio.email || '';
    document.getElementById('fTel').value = currentSocio.telefono || '';
    document.getElementById('fEntidad').value = currentSocio.entidad || '';
    document.getElementById('fCargo').value = currentSocio.cargo_actual || '';
    document.getElementById('fAnos').value = currentSocio.anos_experiencia || 0;
    document.getElementById('fLocalidad').value = currentSocio.localidad || '';
    document.getElementById('fLinkedin').value = currentSocio.linkedin_url || '';
    document.getElementById('fWeb').value = currentSocio.web_profesional || '';
    document.getElementById('fBio').value = currentSocio.bio_profesional || '';

    document.getElementById('fRol').innerHTML = D.ROLES_CLUSTER.map(function (rol) {
      return '<option value="' + rol.id + '"' + (rol.id === currentSocio.rol_cluster ? ' selected' : '') + '>' + rol.nombre + '</option>';
    }).join('');
    document.getElementById('fProvincia').innerHTML = D.PROVINCIAS.map(function (prov) {
      return '<option value="' + prov.nombre + '"' + (prov.nombre === currentSocio.provincia ? ' selected' : '') + '>' + prov.nombre + '</option>';
    }).join('');

    const roleMentorRow = document.getElementById('rowMentor');
    if ((currentSocio.tipo_socio || 'numero') === 'numero') {
      roleMentorRow.style.display = '';
    }

    fillEspecialidades(window.AgesportPortal.parsePgArray(currentSocio.especialidades));
    setPhoto(profileId);

    bindSwitch(document.getElementById('switchActivo'), true);
    bindSwitch(document.getElementById('switchMentor'), !!currentSocio.tutor_mentor);
    bindSwitch(document.getElementById('switchVisTel'), !!currentSocio.visible_telefono);
    bindSwitch(document.getElementById('switchOfrece'), !!currentSocio.b2b_ofrece);
    bindSwitch(document.getElementById('switchBusca'), !!currentSocio.b2b_busca);
    bindSwitch(document.getElementById('switchLicita'), !!currentSocio.b2b_licita);

    if (String(profileId) !== String(session.user.id)) {
      makeReadonly();
    }
  }).catch(function () {});

  document.getElementById('btnPhotoChange').addEventListener('click', function () {
    if (String(profileId) !== String(session.user.id)) return;
    photoInput.click();
  });

  photoInput.addEventListener('change', function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      localStorage.setItem(photoKeyPrefix + profileId, reader.result);
      setPhoto(profileId);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btnPhotoRemove').addEventListener('click', function () {
    if (String(profileId) !== String(session.user.id)) return;
    localStorage.removeItem(photoKeyPrefix + profileId);
    setPhoto(profileId);
  });

  document.getElementById('btnGuardar').addEventListener('click', async function () {
    if (String(profileId) !== String(session.user.id)) return;
    try {
      await request('/api/socios/perfil', {
        method: 'PUT',
        body: JSON.stringify({
          nombre: document.getElementById('fNombre').value.trim(),
          apellidos: document.getElementById('fApellidos').value.trim(),
          telefono: document.getElementById('fTel').value.trim(),
          entidad: document.getElementById('fEntidad').value.trim(),
          cargo_actual: document.getElementById('fCargo').value.trim(),
          anos_experiencia: Number(document.getElementById('fAnos').value || 0),
          rol_cluster: document.getElementById('fRol').value,
          provincia: document.getElementById('fProvincia').value,
          localidad: document.getElementById('fLocalidad').value.trim(),
          linkedin_url: document.getElementById('fLinkedin').value.trim(),
          web_profesional: document.getElementById('fWeb').value.trim(),
          bio_profesional: document.getElementById('fBio').value.trim(),
          especialidades: selectedEspecialidades(),
          visible_telefono: document.getElementById('switchVisTel').classList.contains('on'),
          b2b_ofrece: document.getElementById('switchOfrece').classList.contains('on'),
          b2b_busca: document.getElementById('switchBusca').classList.contains('on'),
          b2b_licita: document.getElementById('switchLicita').classList.contains('on'),
          tutor_mentor: document.getElementById('switchMentor').classList.contains('on'),
          disponibilidad: currentSocio.disponibilidad || 'Media'
        })
      });
      setMessage(document.getElementById('okMsg'), true, 'Perfil actualizado correctamente.');
    } catch (error) {
      setMessage(document.getElementById('okMsg'), false, error.message);
    }
  });

  document.getElementById('btnCambiarPwd').addEventListener('click', async function () {
    const actual = window.prompt('Introduce tu contraseña actual');
    const nueva = window.prompt('Introduce la nueva contraseña');
    if (!actual || !nueva) return;
    try {
      await request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: actual,
          newPassword: nueva
        })
      });
      setMessage(document.getElementById('okMsg'), true, 'Contraseña actualizada correctamente.');
    } catch (error) {
      setMessage(document.getElementById('okMsg'), false, error.message);
    }
  });

  document.getElementById('btnBaja').addEventListener('click', function () {
    setMessage(document.getElementById('okMsg'), false, 'La baja de cuenta requiere validación administrativa. Ponte en contacto con AGESPORT para tramitarla.');
  });
})();
