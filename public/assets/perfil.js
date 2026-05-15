(function () {
  const { requireSession, request, logout, setMessage, queryParam, escapeHtml } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;

  const $ = (id) => document.getElementById(id);
  const title = $('profileTitle');
  const intro = $('profileIntro');
  const profileActions = $('profileActions');
  const contactBtn = $('contactBtn');
  const form = $('profileForm');
  const saveBtn = $('saveBtn');
  const profileMessage = $('profileMessage');
  const passwordForm = $('passwordForm');
  const passwordBtn = $('passwordBtn');
  const passwordMessage = $('passwordMessage');
  const mediaCard = $('mediaCard');
  const bajaCard = $('bajaCard');
  const fotoInput = $('fotoInput');
  const cvInput = $('cvInput');
  const avatarPreview = $('avatarPreview');
  const cvStatus = $('cvStatus');
  const cvViewBtn = $('cvViewBtn');
  const cvDeleteBtn = $('cvDeleteBtn');
  const mediaMessage = $('mediaMessage');
  const bajaForm = $('bajaForm');
  const bajaBtn = $('bajaBtn');
  const bajaMessage = $('bajaMessage');
  const orgField = $('orgField');
  const emailPreferido = $('emailPreferido');
  const especialidadesList = $('especialidadesList');
  const rolDescripcion = $('rolDescripcion');

  $('logoutBtn').addEventListener('click', logout);

  let currentSession;
  let profileId;
  let isOwnProfile = false;

  // ===== Inicialización de selects desde el catálogo =====
  cat.fillTiposSocioSelect($('tipo_socio'), { placeholder: 'Selecciona tipo de socio' });
  cat.fillRolesSelect($('rol_cluster'), { placeholder: 'Selecciona rol del clúster' });
  // CCAA
  const ccaaSelect = $('comunidad_autonoma');
  cat.COMUNIDADES_AUTONOMAS.forEach(function (ca) {
    const opt = document.createElement('option');
    opt.value = ca.slug;
    opt.textContent = ca.label;
    ccaaSelect.appendChild(opt);
  });
  // Provincia inicial: todas
  cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });

  // Cascada CCAA → provincias
  ccaaSelect.addEventListener('change', function () {
    const slug = ccaaSelect.value;
    if (!slug) {
      cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });
      return;
    }
    const ca = cat.COMUNIDADES_AUTONOMAS.find(function (c) { return c.slug === slug; });
    const sel = $('provincia');
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona provincia';
    sel.appendChild(placeholder);
    ca.provincias.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
  });
  // Inversa: al cambiar provincia, autoselecciona CCAA si está vacía
  $('provincia').addEventListener('change', function () {
    if (!ccaaSelect.value) {
      const ca = cat.findCcaaByProvincia($('provincia').value);
      if (ca) ccaaSelect.value = ca.slug;
    }
  });

  // Especialidades como lista seleccionable (multi-checkbox)
  cat.ESPECIALIDADES.forEach(function (e) {
    const row = document.createElement('label');
    row.className = 'selectable-row';
    row.innerHTML =
      '<input type="checkbox" value="' + e.slug + '">' +
      '<div><strong>' + escapeHtml(e.label) + '</strong>' +
      '<div class="muted" style="font-size:.85rem;line-height:1.4;margin-top:2px">' + escapeHtml(e.descripcion) + '</div></div>' +
      '<span class="rol-chip" data-rol="proveedor_servicios_profesionales" style="visibility:hidden">·</span>';
    especialidadesList.appendChild(row);
  });

  // Tipo socio: mostrar campo de organización si es corporativo
  $('tipo_socio').addEventListener('change', function () {
    orgField.style.display = $('tipo_socio').value === 'asociado_corporativo' ? '' : 'none';
  });

  // Descripción del rol seleccionado
  $('rol_cluster').addEventListener('change', function () {
    const rol = cat.findRolBySlug($('rol_cluster').value);
    rolDescripcion.textContent = rol ? rol.descripcion : '';
    rolDescripcion.style.color = rol ? rol.color : '';
  });

  // Selector email_preferido
  emailPreferido.addEventListener('click', function (ev) {
    const btn = ev.target.closest('button');
    if (!btn) return;
    Array.from(emailPreferido.querySelectorAll('button')).forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
  });
  function setEmailPreferido(value) {
    Array.from(emailPreferido.querySelectorAll('button')).forEach(function (b) {
      b.classList.toggle('active', b.dataset.value === value);
    });
  }
  function getEmailPreferido() {
    const btn = emailPreferido.querySelector('button.active');
    return btn ? btn.dataset.value : 'profesional';
  }

  // ===== Carga de datos del perfil =====
  function fillForm(socio) {
    ['nombre', 'apellidos', 'email', 'email_personal', 'telefono', 'entidad', 'cargo_actual',
     'anos_experiencia', 'localidad', 'linkedin_url', 'web_profesional', 'direccion_completa',
     'nombre_organizacion', 'ambito'].forEach(function (id) {
      const el = $(id);
      if (el) el.value = socio[id] || '';
    });

    $('tipo_socio').value = socio.tipo_socio || 'numero';
    orgField.style.display = socio.tipo_socio === 'asociado_corporativo' ? '' : 'none';

    // CCAA + provincia (rellena la cascada)
    if (socio.comunidad_autonoma) {
      ccaaSelect.value = socio.comunidad_autonoma;
      ccaaSelect.dispatchEvent(new Event('change'));
    }
    if (socio.provincia) $('provincia').value = socio.provincia;
    if (!socio.comunidad_autonoma && socio.provincia) {
      const ca = cat.findCcaaByProvincia(socio.provincia);
      if (ca) ccaaSelect.value = ca.slug;
    }

    if (socio.rol_cluster) {
      $('rol_cluster').value = socio.rol_cluster;
      const rol = cat.findRolBySlug(socio.rol_cluster);
      if (rol) {
        rolDescripcion.textContent = rol.descripcion;
        rolDescripcion.style.color = rol.color;
      }
    }

    // Especialidades (parseado de PG array si viene como string)
    const especialidades = Array.isArray(socio.especialidades)
      ? socio.especialidades
      : window.AgesportPortal.parsePgArray(socio.especialidades);
    Array.from(especialidadesList.querySelectorAll('input[type=checkbox]')).forEach(function (cb) {
      cb.checked = especialidades.indexOf(cb.value) !== -1;
    });

    setEmailPreferido(socio.email_preferido || 'profesional');

    // Foto y CV
    if (socio.foto_url) {
      avatarPreview.classList.remove('placeholder');
      avatarPreview.style.backgroundImage = 'url("' + socio.foto_url + '")';
    }
    if (socio.cv_url) {
      cvStatus.textContent = 'CV subido correctamente.';
      cvViewBtn.style.display = '';
      cvViewBtn.href = socio.cv_url;
      cvDeleteBtn.style.display = '';
    }

    ['acepta_mensajeria','acepta_notificaciones_email','visible_telefono','visible_email_directo','visible_web_profesional','visible_linkedin'].forEach(function (key) {
      const el = $(key);
      if (el) el.checked = !!socio[key];
    });
  }

  function lockForOtherProfile() {
    Array.from(form.elements).forEach(function (el) { el.disabled = true; });
    saveBtn.style.display = 'none';
    mediaCard.querySelectorAll('input, button, label.btn-upload').forEach(function (el) { el.style.pointerEvents = 'none'; el.style.opacity = '.55'; });
    passwordForm.style.display = 'none';
    bajaCard.style.display = 'none';
  }

  // ===== Subida de foto =====
  fotoInput.addEventListener('change', async function () {
    if (!fotoInput.files || !fotoInput.files[0]) return;
    const fd = new FormData();
    fd.append('foto', fotoInput.files[0]);
    setMessage(mediaMessage, true, 'Subiendo foto...');
    try {
      const res = await fetch('/api/socios/perfil/foto', {
        method: 'POST', credentials: 'same-origin', body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo foto');
      avatarPreview.classList.remove('placeholder');
      avatarPreview.style.backgroundImage = 'url("' + data.foto_url + '")';
      setMessage(mediaMessage, true, 'Foto actualizada correctamente.');
    } catch (err) {
      setMessage(mediaMessage, false, err.message);
    }
  });

  // ===== Subida de CV =====
  cvInput.addEventListener('change', async function () {
    if (!cvInput.files || !cvInput.files[0]) return;
    const fd = new FormData();
    fd.append('cv', cvInput.files[0]);
    setMessage(mediaMessage, true, 'Subiendo CV...');
    try {
      const res = await fetch('/api/socios/perfil/cv', {
        method: 'POST', credentials: 'same-origin', body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo CV');
      cvStatus.textContent = 'CV subido correctamente.';
      cvViewBtn.style.display = '';
      cvViewBtn.href = data.cv_url;
      cvDeleteBtn.style.display = '';
      setMessage(mediaMessage, true, 'CV actualizado correctamente.');
    } catch (err) {
      setMessage(mediaMessage, false, err.message);
    }
  });

  cvDeleteBtn.addEventListener('click', async function () {
    if (!window.confirm('¿Quitar el CV?')) return;
    try {
      await request('/api/socios/perfil/cv', { method: 'DELETE' });
      cvStatus.textContent = 'No has subido CV todavía.';
      cvViewBtn.style.display = 'none';
      cvDeleteBtn.style.display = 'none';
      cvViewBtn.href = '#';
      setMessage(mediaMessage, true, 'CV eliminado.');
    } catch (err) {
      setMessage(mediaMessage, false, err.message);
    }
  });

  // ===== Inicialización de sesión =====
  requireSession('socio').then(async function (session) {
    currentSession = session;
    profileId = queryParam('id') || session.user.id;
    isOwnProfile = String(profileId) === String(session.user.id);

    const data = await request('/api/socios/perfil/' + profileId, { method: 'GET', headers: {} });
    const socio = data.socio;

    title.textContent = isOwnProfile
      ? 'Mi perfil profesional'
      : (socio.nombre || '') + ' ' + (socio.apellidos || '');
    intro.textContent = isOwnProfile
      ? 'Actualiza tu información profesional, visibilidad y preferencias del entorno privado.'
      : 'Estás viendo la ficha pública de este socio. No puedes editar sus datos.';

    fillForm(socio);

    if (!isOwnProfile) {
      profileActions.style.display = 'flex';
      contactBtn.href = '/mensajes.html?receptor=' + encodeURIComponent(profileId);
      contactBtn.textContent = 'Contactar con ' + (socio.nombre || '');
      lockForOtherProfile();
    }
  }).catch(function () {});

  // ===== Guardar perfil =====
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!isOwnProfile) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    const especialidades = Array.from(especialidadesList.querySelectorAll('input[type=checkbox]:checked'))
      .map(function (cb) { return cb.value; });

    try {
      await request('/api/socios/perfil', {
        method: 'PUT',
        body: JSON.stringify({
          tipo_socio: $('tipo_socio').value || 'numero',
          nombre: $('nombre').value.trim(),
          apellidos: $('apellidos').value.trim(),
          nombre_organizacion: $('nombre_organizacion').value.trim() || null,
          email_personal: $('email_personal').value.trim() || null,
          email_preferido: getEmailPreferido(),
          telefono: $('telefono').value.trim() || null,
          entidad: $('entidad').value.trim(),
          cargo_actual: $('cargo_actual').value.trim(),
          anos_experiencia: Number($('anos_experiencia').value || 0),
          comunidad_autonoma: ccaaSelect.value || null,
          provincia: $('provincia').value,
          localidad: $('localidad').value.trim(),
          ambito: $('ambito').value || null,
          rol_cluster: $('rol_cluster').value || null,
          especialidades: especialidades,
          linkedin_url: $('linkedin_url').value.trim(),
          web_profesional: $('web_profesional').value.trim(),
          direccion_completa: $('direccion_completa').value.trim(),
          acepta_mensajeria: $('acepta_mensajeria').checked,
          acepta_notificaciones_email: $('acepta_notificaciones_email').checked,
          visible_telefono: $('visible_telefono').checked,
          visible_email_directo: $('visible_email_directo').checked,
          visible_web_profesional: $('visible_web_profesional').checked,
          visible_linkedin: $('visible_linkedin').checked
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

  // ===== Cambio de contraseña =====
  passwordForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    passwordBtn.disabled = true;
    passwordBtn.textContent = 'Actualizando...';
    try {
      await request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: $('currentPassword').value,
          newPassword: $('newPassword').value
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

  // ===== Solicitud de baja =====
  bajaForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!window.confirm('¿Seguro que quieres solicitar tu baja? La administración revisará tu petición.')) return;
    bajaBtn.disabled = true;
    bajaBtn.textContent = 'Enviando...';
    try {
      await request('/api/socios/solicitar-baja', {
        method: 'POST',
        body: JSON.stringify({ motivo: $('bajaMotivo').value.trim() || null })
      });
      setMessage(bajaMessage, true, 'Solicitud enviada correctamente. Recibirás noticias en breve.');
      bajaForm.reset();
    } catch (error) {
      setMessage(bajaMessage, false, error.message);
    } finally {
      bajaBtn.disabled = false;
      bajaBtn.textContent = 'Solicitar baja';
    }
  });
})();
